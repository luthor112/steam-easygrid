local logger = require("logger")
local millennium = require("millennium")
local http = require("http")
local utils = require("utils")
local icons = require("icons")

local is_windows = package.config:sub(1, 1) == "\\"

local img_cache = {}
local CHUNK_SIZE = 6 * 1024 * 1024
local download_counter = 0

local function make_tmpfile()
    download_counter = download_counter + 1
    return is_windows and
        ((os.getenv("TEMP") or os.getenv("TMP") or "C:\\Windows\\Temp") .. "\\sgdb_" .. tostring(download_counter) .. ".bin") or
        ("/tmp/sgdb_" .. tostring(download_counter) .. ".bin")
end

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
        if response.status == 401 then
            logger:error(string.format("Got HTTP %d, did you make sure to set an API key in the Easy SteamGrid configuration?", response.status))
        else
            logger:error(string.format("Got HTTP %d", response.status))
        end
        return string.format("{ \"http_status\": %d }", response.status)
    end

    return response.body
end

function download_image(a_img_url)
    logger:info("Downloading image " .. a_img_url)

    if img_cache[a_img_url] then
        os.remove(img_cache[a_img_url])
        img_cache[a_img_url] = nil
    end

    local tmpfile = make_tmpfile()
    local result, err = http.download(a_img_url, tmpfile)
    if not result then
        logger:error("http.download failed: " .. tostring(err))
        return 0
    end
    if result.status ~= 200 then
        logger:error(string.format("Got HTTP %d", result.status))
        os.remove(tmpfile)
        return 0
    end

    img_cache[a_img_url] = tmpfile
    logger:info(string.format("Cached %d bytes at %s", result.bytes_written, tmpfile))
    return result.bytes_written
end

function get_image_chunk(a_img_url, b_chunk_index)
    local path = img_cache[a_img_url]
    if not path then
        logger:error("No cached image for: " .. a_img_url)
        return ""
    end

    local f = io.open(path, "rb")
    if not f then
        logger:error("Cannot open cached file: " .. path)
        return ""
    end

    local offset = b_chunk_index * CHUNK_SIZE
    f:seek("set", offset)
    local data = f:read(CHUNK_SIZE)
    f:close()

    if not data or #data == 0 then
        return ""
    end

    local b64 = utils.base64_encode(data)
    logger:info(string.format("Chunk %d: %d raw bytes → %d b64 chars", b_chunk_index, #data, #(b64 or "")))
    return b64 or ""
end

function cleanup_image(a_img_url)
    if img_cache[a_img_url] then
        logger:info("Cleaning up: " .. img_cache[a_img_url])
        os.remove(img_cache[a_img_url])
        img_cache[a_img_url] = nil
    end
end

function log_frontend(msg)
    logger:info("[frontend] " .. tostring(msg))
end

-- ICONS

function set_icon_from_url(a_appid, b_img_url, c_extension)
    local tmp_path = img_cache[b_img_url]
    if not tmp_path then
        logger:error("set_icon_from_url: no cached download for " .. tostring(b_img_url))
        return false
    end

    local f = io.open(tmp_path, "rb")
    if not f then
        logger:error("set_icon_from_url: cannot open cached file: " .. tmp_path)
        return false
    end
    local bytes = f:read("*a")
    f:close()

    local result = icons.write_icon(a_appid, bytes, c_extension)

    os.remove(tmp_path)
    img_cache[b_img_url] = nil

    return result
end

function clear_icon(a_appid)
    return icons.clear_icon(a_appid)
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
