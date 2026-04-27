local logger = require("logger")
local millennium = require("millennium")
local http = require("http")

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
    local tmpfile = "/tmp/sgdb_" .. tostring(os.time()) .. ".bin"

    local dl_handle = io.popen(string.format(
        "env -u LD_LIBRARY_PATH curl -s -L --max-time 30 --max-filesize 10485760 -w '%%{http_code}' -o %q %q 2>&1",
        tmpfile, img_url
    ))
    if not dl_handle then
        logger:error("io.popen unavailable")
        return ""
    end
    local curl_out = dl_handle:read("*a")
    dl_handle:close()

    if curl_out ~= "200" then
        logger:error("curl failed or non-200: " .. tostring(curl_out))
        os.remove(tmpfile)
        return ""
    end

    local sz_h = io.popen(string.format("stat -c%%s %q 2>/dev/null", tmpfile))
    local fsize = tonumber(sz_h and sz_h:read("*a") or "0") or 0
    if sz_h then sz_h:close() end
    if fsize > 10485760 then
        logger:error(string.format("Image too large (%d bytes), skipping", fsize))
        os.remove(tmpfile)
        return ""
    end
    logger:info(string.format("Image size: %d bytes", fsize))

    local b64_handle = io.popen(string.format("env -u LD_LIBRARY_PATH base64 -w 0 %q", tmpfile))
    if not b64_handle then
        logger:error("base64 popen failed")
        os.remove(tmpfile)
        return ""
    end
    local b64 = b64_handle:read("*a")
    b64_handle:close()
    os.remove(tmpfile)

    logger:info(string.format("Image encoded %d chars", #(b64 or "")))
    return b64 or ""
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
