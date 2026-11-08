#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
firmware-kernel-check.py v2 — 解析 sysupgrade 固件的 FIT,
提取内核数据块(kernel-1 data)与 DTB 的 MD5 作为精确指纹。

背景:
  openwrt.ai 的 ImageBuilder 每日滚动更新(URL 不变, 内容变)。
  10-28 vs 10-29 固件: FIT 结构/lzma压缩/sha1/DTB分区表完全相同,
  但内核二进制数据变了 19% -> 无限重启。
  本脚本用于构建后校验: 内核数据 MD5 与已知正常白名单不一致 => 中止发布。

用法:
  python firmware-kernel-check.py <sysupgrade.bin> [--known MD5,...] [--json]
"""
import hashlib
import json
import struct
import sys

FDT_BEGIN_NODE = 1
FDT_END_NODE = 2
FDT_PROP = 3
FDT_NOP = 4
FDT_END = 9


def parse_fdt(data, base):
    """解析 FDT/FIT 结构，返回 {路径: {属性: value}}
    结构块起点按 mem_rsvmap 全零对之后计算（兼容 mkimage 的 FIT 偏移偏差）。"""
    if data[base:base+4] != b'\xd0\x0d\xfe\xed':
        raise ValueError(f"0x{base:x}: 不是 FDT magic")
    off_mem_rsvmap = struct.unpack('>I', data[base+0x10:base+0x14])[0]
    off_dt_struct = struct.unpack('>I', data[base+0x08:base+0x0c])[0]
    off_dt_strings = struct.unpack('>I', data[base+0x0c:base+0x10])[0]
    size_dt_strings = struct.unpack('>I', data[base+0x20:base+0x24])[0]
    size_dt_struct = struct.unpack('>I', data[base+0x24:base+0x28])[0]
    strtab = data[base+off_dt_strings : base+off_dt_strings+size_dt_strings]
    # mem_rsvmap: 16 字节一对 (addr,size)，全零对结束；结构块从全零对之后开始
    rp = base + off_mem_rsvmap
    while rp + 16 <= len(data):
        pair = data[rp:rp+16]
        if pair == b'\0' * 16:
            rp += 16
            break
        rp += 16
    p = rp
    end = base + off_dt_struct + size_dt_struct
    path = []
    tree = {}
    while p < end:
        token = struct.unpack('>I', data[p:p+4])[0]
        p += 4
        if token == FDT_BEGIN_NODE:
            namelen = data.index(b'\0', p) - p
            name = data[p:p+namelen].decode('utf-8', 'replace')
            p += namelen + 1
            p = (p + 3) & ~3
            path.append(name)
            cur = {}
            # 挂到父节点
            parent = tree
            for seg in path[:-1]:
                parent = parent.setdefault('_nodes', {}).setdefault(seg, {})
            parent.setdefault('_nodes', {})[name] = cur
        elif token == FDT_END_NODE:
            path.pop()
            cur = {}
        elif token == FDT_PROP:
            plen = struct.unpack('>I', data[p:p+4])[0]
            nameoff = struct.unpack('>I', data[p+4:p+8])[0]
            p += 8
            val = data[p:p+plen]
            p += plen
            p = (p + 3) & ~3
            pname = strtab[nameoff:strtab.index(b'\0', nameoff)].decode('utf-8', 'replace')
            cur[pname] = val
        elif token == FDT_NOP:
            continue
        elif token == FDT_END:
            break
        else:
            raise ValueError(f"0x{p:x}: 未知 FDT token {token}")
    return tree


def find_prop(tree, node_path, prop):
    """按路径找属性值: node_path 如 ['images','kernel@1']"""
    node = tree
    for seg in node_path:
        node = node.get('_nodes', {}).get(seg)
        if node is None:
            return None
    return node.get(prop)


def scan_fw(path):
    with open(path, 'rb') as f:
        data = f.read()
    sq_pos = data.find(b'hsqs')
    if sq_pos < 0:
        raise ValueError(f"{path}: 未找到 squashfs superblock")
    fits = [m.start() for m in __import__('re').finditer(b'\xd0\x0d\xfe\xed', data[:sq_pos])]
    info = {
        'file': path,
        'total_size': len(data),
        'squashfs_offset': hex(sq_pos),
        'fit_positions': [hex(x) for x in fits],
        'kernel_md5': None,
        'kernel_size': None,
        'kernel_desc': None,
        'dtb_md5': None,
        'dtb_size': None,
    }
    # 主 FIT @0x800 (OpenWrt 标准布局)
    try:
        fit = parse_fdt(data, 0x800)
        # 根节点名为空 -> 挂在 _nodes[''] 下
        root = fit.get('_nodes', {}).get('', fit)
        imgs = root.get('_nodes', {}).get('images', {}).get('_nodes', {})
        for kname in ('kernel@1', 'kernel-1', 'kernel'):
            knode = imgs.get(kname)
            if knode and 'data' in knode:
                kdata = knode['data']
                info['kernel_md5'] = hashlib.md5(kdata).hexdigest().upper()
                info['kernel_size'] = len(kdata)
                desc = knode.get('description', b'').decode('utf-8', 'replace')
                info['kernel_desc'] = desc
                break
        # dtb: images/fdt@1/data 或 images/fdt-1/data
        for fname in ('fdt@1', 'fdt-1', 'fdt'):
            fnode = imgs.get(fname)
            if fnode and 'data' in fnode:
                fdata = fnode['data']
                info['dtb_md5'] = hashlib.md5(fdata).hexdigest().upper()
                info['dtb_size'] = len(fdata)
                break
    except Exception as e:
        info['fit_error'] = str(e)
    return info


def main():
    argv = sys.argv[1:]
    args = [a for a in argv if not a.startswith('--')]
    flags = [a for a in argv if a.startswith('--')]
    if not args:
        print(__doc__)
        sys.exit(2)
    path = args[0]
    known = None
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--known' and i + 1 < len(argv):
            known = set(argv[i+1].split(','))
            i += 1
        elif a.startswith('--known='):
            known = set(a[len('--known='):].split(','))
        i += 1
    try:
        info = scan_fw(path)
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)

    if '--json' in flags:
        print(json.dumps(info, ensure_ascii=False, indent=1))
    else:
        print(f"文件: {info['file']}")
        print(f"总大小: {info['total_size']} B, squashfs @ {info['squashfs_offset']}")
        print(f"FIT 位置: {', '.join(info['fit_positions'])}")
        if info.get('kernel_md5'):
            print(f"内核数据: {info['kernel_size']} B, MD5={info['kernel_md5']}")
            print(f"  描述: {info['kernel_desc']}")
        if info.get('dtb_md5'):
            print(f"DTB: {info['dtb_size']} B, MD5={info['dtb_md5']}")
        if info.get('fit_error'):
            print(f"FIT 解析错误: {info['fit_error']}")

    if known:
        ok = (info.get('kernel_md5') in known)
        print(f"\n内核指纹校验: {'PASS' if ok else 'FAIL'} (MD5={info.get('kernel_md5')})")
        print(f"  白名单: {', '.join(sorted(known))}")
        sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
