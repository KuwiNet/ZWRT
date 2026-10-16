module("luci.controller.zwrt", package.seeall)

function index()
	entry({"admin", "system", "zwrt"}, view("zwrt/settings"), _("ZWRT设置"), 63).dependent = false
end
