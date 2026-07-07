local millennium = require("millennium")
local utils = require("utils")
local fs = require("fs")
local logger = require("logger")

local M = {}

local BACKUP_SUFFIX = ".easygrid_orig"
local PNG_SIGNATURE = "\137\80\78\71\13\10\26\10"

local function steam_userdata_path()
    return fs.join(millennium.steam_path(), "userdata")
end

local function steam_library_cache_path()
    return fs.join(millennium.steam_path(), "appcache", "librarycache")
end

local function remove_matching_stem(dir, stem)
    local entries = fs.list(dir) or {}
    for _, entry in ipairs(entries) do
        if entry.is_file and fs.stem(entry.path) == stem then
            fs.remove(entry.path)
        end
    end
end

local function is_hashed_icon_file(entry)
    if not entry.is_file then return false end
    local stem = fs.stem(entry.path)
    local ext = string.lower(fs.extension(entry.path) or "")
    return #stem == 40 and string.match(stem, "^%x+$") ~= nil
        and (ext == ".jpg" or ext == ".jpeg" or ext == ".png" or ext == ".ico")
end

local function read_u16(bytes, offset)
    local b1, b2 = string.byte(bytes, offset + 1, offset + 2)
    return (b1 or 0) + (b2 or 0) * 256
end

local function read_u32(bytes, offset)
    local b1, b2, b3, b4 = string.byte(bytes, offset + 1, offset + 4)
    return (b1 or 0) + (b2 or 0) * 256 + (b3 or 0) * 65536 + (b4 or 0) * 16777216
end

local function extract_png_from_ico(bytes)
    if #bytes < 6 then return nil end
    if read_u16(bytes, 0) ~= 0 or read_u16(bytes, 2) ~= 1 then return nil end
    local count = read_u16(bytes, 4)

    local best_chunk = nil
    local best_area = -1
    for i = 0, count - 1 do
        local entry_offset = 6 + i * 16
        if entry_offset + 16 > #bytes then break end
        local width = string.byte(bytes, entry_offset + 1) or 0
        local height = string.byte(bytes, entry_offset + 2) or 0
        if width == 0 then width = 256 end
        if height == 0 then height = 256 end
        local data_size = read_u32(bytes, entry_offset + 8)
        local data_offset = read_u32(bytes, entry_offset + 12)

        if data_size > 0 and data_offset + data_size <= #bytes then
            local chunk = string.sub(bytes, data_offset + 1, data_offset + data_size)
            if string.sub(chunk, 1, 8) == PNG_SIGNATURE then
                local area = width * height
                if area > best_area then
                    best_area = area
                    best_chunk = chunk
                end
            end
        end
    end

    return best_chunk
end

---Write icon bytes to every location Steam reads an app icon from.
---@param appid string|number
---@param bytes string raw file bytes (already downloaded)
---@param extension string file extension without the dot, e.g. "png" or "ico"
---@return boolean success
function M.write_icon(appid, bytes, extension)
    appid = tostring(appid)
    extension = tostring(extension or "png"):lower()

    if extension == "ico" then
        local png_bytes = extract_png_from_ico(bytes)
        if not png_bytes then
            logger:error("write_icon: .ico has no embedded PNG frame, skipping appid " .. appid)
            return false
        end
        bytes = png_bytes
        extension = "png"
    end

    local wrote_any = false
    local base_name = appid .. "_icon"

    local userdata_path = steam_userdata_path()
    if fs.exists(userdata_path) then
        local file_name = base_name .. "." .. extension
        local users = fs.list(userdata_path) or {}
        for _, user_entry in ipairs(users) do
            if user_entry.is_directory then
                local grid_dir = fs.join(user_entry.path, "config", "grid")
                if not fs.exists(grid_dir) then
                    fs.create_directories(grid_dir)
                end
                remove_matching_stem(grid_dir, base_name)
                utils.write_file(fs.join(grid_dir, file_name), bytes)
                wrote_any = true
            end
        end
    end

    local cache_dir = steam_library_cache_path()
    if fs.exists(cache_dir) then
        remove_matching_stem(cache_dir, base_name)
        utils.write_file(fs.join(cache_dir, base_name .. "." .. extension), bytes)
        wrote_any = true

        local app_cache_dir = fs.join(cache_dir, appid)
        if fs.exists(app_cache_dir) then
            local entries = fs.list(app_cache_dir) or {}
            for _, entry in ipairs(entries) do
                if is_hashed_icon_file(entry) then
                    local backup_path = entry.path .. BACKUP_SUFFIX
                    if not fs.exists(backup_path) then
                        fs.copy(entry.path, backup_path)
                    end
                    utils.write_file(entry.path, bytes)
                    wrote_any = true
                end
            end
        end
    end

    return wrote_any
end

---Remove any custom icon set via write_icon and restore the original hashed
---cache file from backup, if one was made.
---@param appid string|number
---@return boolean changed
function M.clear_icon(appid)
    appid = tostring(appid)
    local base_name = appid .. "_icon"
    local changed = false

    local cache_dir = steam_library_cache_path()
    if fs.exists(cache_dir) then
        remove_matching_stem(cache_dir, base_name)

        local app_cache_dir = fs.join(cache_dir, appid)
        if fs.exists(app_cache_dir) then
            local entries = fs.list(app_cache_dir) or {}
            for _, entry in ipairs(entries) do
                if entry.is_file and utils.endswith(entry.path, BACKUP_SUFFIX) then
                    local original_path = string.sub(entry.path, 1, #entry.path - #BACKUP_SUFFIX)
                    if fs.exists(original_path) then
                        fs.remove(original_path)
                    end
                    fs.copy(entry.path, original_path)
                    fs.remove(entry.path)
                    changed = true
                end
            end
        end
    end

    local userdata_path = steam_userdata_path()
    if fs.exists(userdata_path) then
        local users = fs.list(userdata_path) or {}
        for _, user_entry in ipairs(users) do
            if user_entry.is_directory then
                local grid_dir = fs.join(user_entry.path, "config", "grid")
                if fs.exists(grid_dir) then
                    remove_matching_stem(grid_dir, base_name)
                end
            end
        end
    end

    return changed
end

return M
