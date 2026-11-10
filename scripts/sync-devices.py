#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sync-devices.py — 把 zwrt-web 的网站设备库同步到 main 的构建设备库。

背景:
  设备库在两个分支各有一份(部署形态不同，无法物理合并):
    zwrt-web: site/public/data/devices.json  (网站侧，唯一需要手工维护的数据源)
    main:     targets/devices.json           (ImageBuilder 构建时读取)
  本脚本以 zwrt-web 为唯一数据源自动更新 main，避免维护两份或漏同步。

用法:
  python scripts/sync-devices.py          # 同步并在 main 提交(不 push)
  python scripts/sync-devices.py --push   # 同步、提交并推送 main

前提:
  工作区干净(无未提交改动)。脚本会临时切到 main，再切回原分支。
"""
import os
import shutil
import subprocess
import sys


def find_git():
    """解析 git 可执行文件路径（Windows 上 git 常不在 PATH）。"""
    found = shutil.which("git")
    if found:
        return found
    candidates = [
        os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"),
                     "Git", "cmd", "git.exe"),
        r"C:\Program Files\Git\cmd\git.exe",
        r"C:\Program Files (x86)\Git\cmd\git.exe",
        "/usr/bin/git",
    ]
    for cand in candidates:
        if cand and os.path.exists(cand):
            return cand
    return "git"


GIT_BIN = find_git()
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_BRANCH = "zwrt-web"
SRC_PATH = "site/public/data/devices.json"
DST_PATH = "targets/devices.json"
COMMIT_MSG = "chore: 同步 devices.json 至 zwrt-web 最新设备库"


def git(*args, check=True):
    r = subprocess.run([GIT_BIN, *args], cwd=REPO,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if check and r.returncode != 0:
        raise RuntimeError("git %s 失败(%d): %s" % (
            args[0], r.returncode,
            r.stderr.decode("utf-8", "replace").strip()))
    return r


def main():
    do_push = "--push" in sys.argv

    if git("status", "--porcelain").stdout.strip():
        print("工作区存在未提交改动，请先提交或 stash 后再运行。", file=sys.stderr)
        return 1

    original = git("branch", "--show-current").stdout.decode("utf-8").strip()
    if not original:
        print("当前处于 detached HEAD，请先切到具体分支。", file=sys.stderr)
        return 1

    # 取 zwrt-web 已提交的源数据，统一归一化为 LF
    src = git("show", "%s:%s" % (SRC_BRANCH, SRC_PATH)).stdout
    data = src.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    if not data.endswith(b"\n"):
        data += b"\n"

    err = None
    try:
        git("checkout", "main")
        with open(os.path.join(REPO, DST_PATH), "wb") as f:
            f.write(data)
        git("add", DST_PATH)

        if not git("diff", "--cached", "--name-only").stdout.strip():
            print("main 的 targets/devices.json 已是最新，无需提交。")
            return 0

        git("commit", "-m", COMMIT_MSG)
        print("main 新提交: %s" % git("rev-parse", "HEAD").stdout.decode().strip())
        if do_push:
            git("push", "origin", "main")
            print("已推送 main。")
        else:
            print("尚未 push。确认后执行: git push origin main")
    except Exception as e:
        err = e
    finally:
        cur = git("branch", "--show-current").stdout.decode().strip()
        if cur != original:
            back = git("checkout", original, check=False)
            if back.returncode != 0:
                print("警告: 未能切回 %s，当前停在 main，请手动处理。" % original,
                      file=sys.stderr)

    if err:
        print("同步出错: %s" % err, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
