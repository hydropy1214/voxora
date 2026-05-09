-- CallsPsy FreeSWITCH startup script
freeswitch.consoleLog("INFO", "[CallsPsy] FreeSWITCH Lua runtime initialized\n")
freeswitch.consoleLog("INFO", string.format("[CallsPsy] Public IP: %s\n", 
  freeswitch.getGlobalVariable("public_ip") or "unknown"))
