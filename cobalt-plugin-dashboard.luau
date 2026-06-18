-- Dashboard Spy Forwarder
-- Sends intercepted remote calls to external dashboard

Cobalt.PluginData = {
    Name = "Dashboard Spy Forwarder",
    Description = "Forwards intercepted remote calls to the Roblox MCP dashboard for analysis.",
    Author = "Roblox MCP",
    Version = "1.0.0",
    Game = "*",
}

local HttpService = game:GetService("HttpService")

local BASE_URL = "https://b23ffa22-2935-4fde-bada-320bd444d14d-00-29cuq2dlja6xl.worf.replit.dev"

local function getRemotePath(remote)
    if not remote then
        return "Unknown"
    end

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

    if not args then
        return out
    end

    for i, v in pairs(args) do
        local t = typeof(v)

        if t == "string" or t == "number" or t == "boolean" then
            out[i] = v

        elseif t == "Instance" then
            out[i] = tostring(v)

        elseif t == "Vector3" then
            out[i] = {
                X = v.X,
                Y = v.Y,
                Z = v.Z,
                __type = "Vector3"
            }

        elseif t == "Color3" then
            out[i] = {
                R = v.R,
                G = v.G,
                B = v.B,
                __type = "Color3"
            }

        elseif t == "CFrame" then
            out[i] = tostring(v)

        elseif t == "UDim2" then
            out[i] = tostring(v)

        elseif t == "EnumItem" then
            out[i] = tostring(v)

        elseif t == "table" then
            out[i] = v

        else
            out[i] = tostring(v)
        end
    end

    return out
end

local function sendLog(data)
    local ok, json = pcall(function()
        return HttpService:JSONEncode(data)
    end)

    if not ok then
        warn("[Dashboard Spy] Failed to encode payload")
        return
    end

    task.spawn(function()
        local success, result = pcall(function()
            return HttpService:RequestAsync({
                Url = BASE_URL .. "/api/cobalt/logs",
                Method = "POST",
                Headers = {
                    ["Content-Type"] = "application/json"
                },
                Body = json
            })
        end)

        if not success then
            warn("[Dashboard Spy] Request failed:", result)
            return
        end

        if result and not result.Success then
            warn(
                "[Dashboard Spy] HTTP Error:",
                result.StatusCode,
                result.Body
            )
        end
    end)
end

local cleanup = Cobalt.Spy:InterceptExecutedCalls(
    "All",
    function(info, instance, callType)

        if not instance then
            return
        end

        local args =
            info.Arguments
            or info.Args
            or {}

        local generatedCode = nil

        pcall(function()
            generatedCode = Cobalt.CodeGen.Serialize(args, {
                Prettify = true
            })
        end)

        local payload = {
            remoteName = instance.Name,
            remotePath = getRemotePath(instance),
            direction = string.lower(callType or "Unknown"),
            args = serializeArgs(args),

            timestamp = os.time() * 1000,

            debugInfo = string.format(
                "Origin: %s | Line: %s",
                tostring(info.Origin),
                tostring(info.Line)
            ),

            generatedCode = generatedCode
        }

        sendLog(payload)
    end
)

Cobalt:BindToUnload(function()
    if cleanup then
        cleanup()
    end
end)

Cobalt.Sonner.success("Dashboard Spy Forwarder loaded")