local logger = require("logger")
local millennium = require("millennium")
local http = require("http")
local utils = require("utils")
local icons = require("icons")
local fs = require("fs")

local is_windows = package.config:sub(1, 1) == "\\"

local img_cache = {}
local CHUNK_SIZE = 5 * 1024 * 1024
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

    local data = f:read("*a")
    f:close()

    local b64_full = utils.base64_encode(data)

    local offset = b_chunk_index * CHUNK_SIZE
    local b64 = b64_full:sub(offset + 1, offset + CHUNK_SIZE)

    if #b64 == 0 then
        return ""
    end

    logger:info(string.format("Chunk %d: %d b64 chars (total: %d)", b_chunk_index, #b64, #b64_full))
    return b64
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
        return "the downloaded icon is no longer available"
    end

    local f = io.open(tmp_path, "rb")
    if not f then
        logger:error("set_icon_from_url: cannot open cached file: " .. tmp_path)
        return "the downloaded icon could not be read"
    end
    local bytes = f:read("*a")
    f:close()

    local ok, reason = icons.write_icon(a_appid, bytes, c_extension)

    os.remove(tmp_path)
    img_cache[b_img_url] = nil

    if ok then return "" end
    return reason or "the icon could not be written"
end

function clear_icon(a_appid)
    return icons.clear_icon(a_appid)
end

function get_icon_path(a_appid)
    return icons.get_icon_path(a_appid)
end

-- MISSING IMAGES

-- Image types: 0 = grid, 1 = hero, 2 = logo, 3 = wide grid, 4 = icon
local CUSTOM_SUFFIXES = { [0] = "p", [1] = "_hero", [2] = "_logo", [3] = "", [4] = "_icon" }

local grid_stems = nil
local grid_stems_time = 0

local function get_grid_stems()
    if grid_stems and os.time() - grid_stems_time < 10 then return grid_stems end
    grid_stems = {}
    local userdata_path = fs.join(millennium.steam_path(), "userdata")
    if fs.exists(userdata_path) then
        for _, user_entry in ipairs(fs.list(userdata_path) or {}) do
            if user_entry.is_directory then
                local grid_dir = fs.join(user_entry.path, "config", "grid")
                if fs.exists(grid_dir) then
                    for _, entry in ipairs(fs.list(grid_dir) or {}) do
                        if entry.is_file then grid_stems[string.lower(fs.stem(entry.path))] = true end
                    end
                end
            end
        end
    end
    grid_stems_time = os.time()
    return grid_stems
end

-- Official asset names, optionally followed by a language suffix (e.g. header_italian)
local function official_type(stem)
    local function is(base)
        if stem == base then return true end
        local lang = string.match(stem, "^" .. base .. "_(%a+)$")
        return lang ~= nil and lang ~= "blur"
    end
    if is("library_600x900") or is("library_capsule") then return 0 end
    if is("library_hero") then return 1 end
    if is("logo") then return 2 end
    if is("header") or is("library_header") then return 3 end
    return nil
end

-- Real vertical capsules are JPEGs; for apps without one, Steam serves a generated
-- placeholder (the header stretched over a blurred background) that is a PNG named .jpg
local function is_png(path)
    local f = io.open(path, "rb")
    if not f then return false end
    local head = f:read(4)
    f:close()
    return head == "\137PNG"
end

local function scan_official(dir, found, is_root)
    for _, entry in ipairs(fs.list(dir) or {}) do
        if entry.is_directory then
            if is_root then scan_official(entry.path, found, false) end
        elseif entry.is_file then
            local stem = string.lower(fs.stem(entry.path))
            local t = official_type(stem)
            if t == 0 and is_png(entry.path) then
                -- generated placeholder, treat the grid as missing
            elseif t then
                found[t] = true
            elseif is_root and #stem == 40 and string.match(stem, "^%x+$") then
                found[4] = true
            end
        end
    end
end

-- Returns the missing image types of an app as a comma-separated string, e.g. "0,1,3"
function get_missing_images(a_appid)
    local appid = tostring(a_appid)
    local found = {}

    local app_cache_dir = fs.join(millennium.steam_path(), "appcache", "librarycache", appid)
    if fs.exists(app_cache_dir) then scan_official(app_cache_dir, found, true) end

    local stems = get_grid_stems()
    local missing = {}
    for t = 0, 4 do
        if stems[appid .. CUSTOM_SUFFIXES[t]] then found[t] = true end
        if not found[t] then table.insert(missing, tostring(t)) end
    end
    return table.concat(missing, ",")
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
