local millennium = require("millennium")
local utils = require("utils")
local fs = require("fs")
local logger = require("logger")
local ico = require("ico")

local M = {}

local BACKUP_SUFFIX = ".easygrid_orig"

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

---Write icon bytes to every location Steam reads an app icon from.
---@param appid string|number
---@param bytes string raw file bytes (already downloaded)
---@param extension string file extension without the dot, e.g. "png" or "ico"
---@return boolean success
---@return string? reason why the icon could not be written
function M.write_icon(appid, bytes, extension)
    appid = tostring(appid)
    extension = tostring(extension or "png"):lower()

    if extension == "ico" then
        local png_bytes, reason = ico.ico_to_png(bytes)
        if not png_bytes then
            logger:error("write_icon: could not convert .ico to PNG (" .. tostring(reason) .. "), skipping appid " .. appid)
            return false, "could not convert this .ico (" .. tostring(reason) .. ")"
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

    if not wrote_any then
        return false, "found no place to write the icon to"
    end
    return true
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

---Path (with forward slashes) of the custom icon file saved for an app in a Steam user's grid folder
---@param appid string|number
---@return string path empty when there is none
function M.get_icon_path(appid)
    local base_name = tostring(appid) .. "_icon"

    local userdata_path = steam_userdata_path()
    if not fs.exists(userdata_path) then return "" end

    for _, user_entry in ipairs(fs.list(userdata_path) or {}) do
        if user_entry.is_directory then
            local grid_dir = fs.join(user_entry.path, "config", "grid")
            if fs.exists(grid_dir) then
                for _, entry in ipairs(fs.list(grid_dir) or {}) do
                    if entry.is_file and fs.stem(entry.path) == base_name then
                        return (string.gsub(entry.path, "\\", "/"))
                    end
                end
            end
        end
    end

    return ""
end

return M
