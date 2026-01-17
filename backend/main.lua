local logger = require("logger")
local millennium = require("millennium")
local http = require("http")
local utils = require("utils")

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
        return string.format("{ 'http_status': %d }", response.status)
    end

    return response.body
end

function get_encoded_image(img_url)
    logger:info("Requesting image " .. img_url)
    local response, err = http.get(img_url)

    if not response then
        logger:error(err)
        return ""
    end

    if response.status ~= 200 then
        logger:error(string.format("Got HTTP %d", response.status))
        return ""
    end

    return utils.base64_encode(response.body)
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
