module("luci.controller.zwrt", package.seeall)

function index()
	entry({"admin", "system", "zwrt"}, view("zwrt/settings"), _("ZWRT主题设置"), 14).dependent = false
end
