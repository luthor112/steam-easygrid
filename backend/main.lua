local logger = require("logger")
local millennium = require("millennium")
local http = require("http")
local utils = require("utils")

local is_windows = package.config:sub(1, 1) == "\\"

-- INTERFACES

function call_api_backend(a_bearer, b_endpoint)
    local bearer = a_bearer
    local endpoint = "https://www.steamgriddb.com/api/v2/" .. b_endpoint

    logger:info("Querying endpoint " .. endpoint)
    local response, err = http.get(endpoint, {
        headers = {
            ["Accept"] = "application/json",
            ["Authorization"] = "Bearer " .. bearer,
        }
    })

    if not response then
        logger:error(err)
        return ""
    end

    if response.status ~= 200 then
        logger:error(string.format("Got HTTP %d", response.status))
        return string.format("{ \"http_status\": %d }", response.status)
    end

    return response.body
end

function get_encoded_image(img_url)
    logger:info("Requesting image " .. img_url)

    local tmpfile = is_windows and
        ((os.getenv("TEMP") or os.getenv("TMP") or "C:\\Windows\\Temp") .. "\\sgdb_" .. tostring(os.time()) .. ".bin") or
        ("/tmp/sgdb_" .. tostring(os.time()) .. ".bin")

    local result, err = http.download(img_url, tmpfile)
    if not result then
        logger:error("http.download failed: " .. tostring(err))
        return ""
    end
    if result.status ~= 200 then
        logger:error(string.format("Got HTTP %d", result.status))
        os.remove(tmpfile)
        return ""
    end
    if result.bytes_written > 10 * 1024 * 1024 then
        logger:warn(string.format("Image too large (%d bytes), skipping", result.bytes_written))
        os.remove(tmpfile)
        return ""
    end
    logger:info(string.format("Image size: %d bytes", result.bytes_written))

    local f = io.open(tmpfile, "rb")
    if not f then
        logger:error("Could not open temp file: " .. tmpfile)
        return ""
    end
    local data = f:read("*a")
    f:close()
    os.remove(tmpfile)

    if not data or #data == 0 then
        logger:error("Temp file is empty")
        return ""
    end

    local b64 = utils.base64_encode(data)
    if not b64 or b64 == "" then
        logger:error("base64_encode returned empty")
        return ""
    end

    logger:info(string.format("Image encoded %d chars", #b64))
    return b64
end

function log_frontend(msg)
    logger:info("[frontend] " .. tostring(msg))
end

-- PLUGIN MANAGEMENT

local function on_frontend_loaded()
    logger:info("Frontend loaded")
end

local function on_load()
    logger:info("Backend loaded")
    millennium.ready()
end

local function on_unload()
    logger:info("Backend unloaded")
end

return {
    on_frontend_loaded = on_frontend_loaded,
    on_load = on_load,
    on_unload = on_unload
}