-- Cobalt Remote Spy Dashboard Plugin
-- Forward intercepted remote calls to your Roblox MCP dashboard
-- Base URL: https://b23ffa22-2935-4fde-bada-320bd444d14d-00-29cuq2dlja6xl.worf.replit.dev/

local HttpService = game:GetService("HttpService")
local BASE_URL = "https://b23ffa22-2935-4fde-bada-320bd444d14d-00-29cuq2dlja6xl.worf.replit.dev"

local Plugin = {
    Name = "Dashboard Spy Forwarder",
    Description = "Forwards intercepted remote calls to the Roblox MCP dashboard for analysis by AI.",
    Author = "Roblox MCP",
    Version = "1.0.0",
    Icon = "rbxassetid://0",
    Color = Color3.fromRGB(59, 130, 246),
    Init = nil,
}

local function getRemotePath(remote)
    local path = remote.Name
    local parent = remote.Parent
    while parent and parent ~= game do
        path = parent.Name .. "." .. path
        parent = parent.Parent
    end
    return path
end

local function serializeArgs(args)
    local out = {}
    for i, v in ipairs(args) do
        local t = typeof(v)
        if t == "string" then
            out[i] = v
        elseif t == "number" or t == "boolean" then
            out[i] = v
        elseif t == "table" then
            out[i] = v
        elseif t == "Instance" then
            out[i] = tostring(v)
        elseif t == "Vector3" then
            out[i] = { X = v.X, Y = v.Y, Z = v.Z, __type = "Vector3" }
        elseif t == "CFrame" then
            out[i] = { X = v.X, Y = v.Y, Z = v.Z, __type = "CFrame" }
        elseif t == "Color3" then
            out[i] = { R = v.R, G = v.G, B = v.B, __type = "Color3" }
        elseif t == "UDim2" then
            out[i] = { X = { Scale = v.X.Scale, Offset = v.X.Offset }, Y = { Scale = v.Y.Scale, Offset = v.Y.Offset }, __type = "UDim2" }
        elseif t == "EnumItem" then
            out[i] = tostring(v)
        elseif t == "nil" then
            out[i] = nil
        else
            out[i] = tostring(v)
        end
    end
    return out
end

local function sendLog(data)
    local ok, json = pcall(HttpService.JSONEncode, HttpService, data)
    if not ok then return end
    task.defer(function()
        pcall(HttpService.RequestAsync, HttpService, {
            Url = BASE_URL .. "/api/cobalt/logs",
            Method = "POST",
            Headers = {
                ["Content-Type"] = "application/json",
            },
            Body = json,
        })
    end)
end

function Plugin.Init(pluginAPI)
    local spy = pluginAPI.Spy
    local codegen = pluginAPI.CodeGen

    spy:InterceptExecutedCalls("All", function(info)
        local remote = info.Remote
        local args = info.Args or {}
        local direction = info.Direction or "Unknown"
        local scriptCtx = info.Script or "Unknown"
        local line = info.Line or 0

        local path = getRemotePath(remote)
        local name = remote.Name

        local generatedCode
        pcall(function()
            generatedCode = codegen:Serialize(remote, args)
        end)

        local payload = {
            remoteName = name,
            remotePath = path,
            direction = direction:lower(),
            args = serializeArgs(args),
            timestamp = os.time() * 1000,
            debugInfo = string.format("Script: %s | Line: %d", tostring(scriptCtx), line),
            generatedCode = generatedCode,
        }

        sendLog(payload)
    end)
end

return Plugin
