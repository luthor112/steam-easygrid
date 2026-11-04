local millennium = require("millennium")
local fs = require("fs")
local logger = require("logger")
local cjson = require("cjson")
local icons = require("icons")

local M = {}

local NAME_PREFIX = "easygrid-backup-"
local MANIFEST = "manifest.json"
local GRID_DIR = "grid"
local STORE_DIR = "store"
local STORE_FILES = { "luthor112.steam-easygrid.overrides.json", "luthor112.steam-easygrid.customization.json" }

local function normalize(path)
    return (string.gsub(path, "\\", "/"))
end

local function userdata_path()
    return fs.join(millennium.steam_path(), "userdata")
end

local function store_dir()
    return fs.join(millennium.steam_path(), "millennium", "config", "steam-easygrid")
end

function M.default_root()
    return normalize(fs.join(store_dir(), "backups"))
end

local function resolve_root(root)
    if root == nil or string.match(root, "^%s*$") then return M.default_root() end
    return normalize(root)
end

local function count_files(dir)
    local count = 0
    for _, entry in ipairs(fs.list_recursive(dir) or {}) do
        if entry.is_file then count = count + 1 end
    end
    return count
end

local function read_manifest(dir)
    local f = io.open(fs.join(dir, MANIFEST), "rb")
    if not f then return nil end
    local raw = f:read("*a")
    f:close()
    local ok, manifest = pcall(cjson.decode, raw)
    if ok and type(manifest) == "table" then return manifest end
    return nil
end

local function remove_matching_stem(dir, stem)
    for _, entry in ipairs(fs.list(dir) or {}) do
        if entry.is_file and fs.stem(entry.path) == stem then
            fs.remove(entry.path)
        end
    end
end

---Backups found at a path: the path itself if it is a backup, otherwise the backups inside it
---@param path string
---@return table[] backups newest first
function M.list(path)
    path = resolve_root(path)
    local found = {}
    local function add(dir)
        local manifest = read_manifest(dir)
        if manifest then
            table.insert(found, {
                name = fs.filename(dir),
                path = normalize(dir),
                created = manifest.created or 0,
                grid_files = manifest.grid_files or 0,
                users = manifest.users or 0,
            })
        end
    end

    if fs.exists(path) and fs.is_directory(path) then
        if fs.exists(fs.join(path, MANIFEST)) then
            add(path)
        else
            for _, entry in ipairs(fs.list(path) or {}) do
                if entry.is_directory then add(entry.path) end
            end
        end
    end

    table.sort(found, function(a, b)
        if a.created ~= b.created then return a.created > b.created end
        return a.name > b.name
    end)
    return found
end

-- Only ever deletes folders this plugin created in the backup folder
local function prune(root, keep, protect_path)
    keep = math.max(1, tonumber(keep) or 5)
    local ours = {}
    for _, backup in ipairs(M.list(root)) do
        if string.sub(backup.name, 1, #NAME_PREFIX) == NAME_PREFIX then table.insert(ours, backup) end
    end
    for i = keep + 1, #ours do
        if ours[i].path ~= protect_path then
            fs.remove_all(ours[i].path)
            logger:info("Pruned old backup " .. ours[i].name)
        end
    end
end

---@param root string backup folder, empty for the default one
---@param keep number how many backups to keep in that folder
---@param suffix string? appended to the backup's name
---@param protect_path string? backup that must survive pruning
---@return table result { ok, error?, name?, path?, grid_files? }
function M.create(root, keep, suffix, protect_path)
    root = resolve_root(root)
    local ok_dir, dir_err = fs.create_directories(root)
    if ok_dir == nil or not fs.is_directory(root) then
        return { ok = false, error = "cannot create the backup folder " .. root .. " (" .. tostring(dir_err) .. ")" }
    end

    local base_name = NAME_PREFIX .. os.date("%Y%m%d-%H%M%S") .. (suffix or "")
    local name, dest, n = base_name, nil, 1
    repeat
        dest = fs.join(root, name)
        n = n + 1
        name = base_name .. "-" .. n
    until not fs.exists(dest)
    fs.create_directories(dest)

    local users, grid_files = 0, 0
    local udata = userdata_path()
    for _, user_entry in ipairs(fs.exists(udata) and fs.list(udata) or {}) do
        local grid_dir = fs.join(user_entry.path, "config", "grid")
        if user_entry.is_directory and fs.exists(grid_dir) then
            local target = fs.join(dest, GRID_DIR, fs.filename(user_entry.path))
            fs.create_directories(target)
            local copied, err = fs.copy_recursive(grid_dir, target)
            if not copied then
                fs.remove_all(dest)
                return { ok = false, error = "copying " .. grid_dir .. " failed (" .. tostring(err) .. ")" }
            end
            users = users + 1
            grid_files = grid_files + count_files(target)
        end
    end

    local store_files = 0
    for _, file in ipairs(STORE_FILES) do
        local source = fs.join(store_dir(), file)
        if fs.exists(source) then
            fs.create_directories(fs.join(dest, STORE_DIR))
            if fs.copy(source, fs.join(dest, STORE_DIR, file)) then store_files = store_files + 1 end
        end
    end

    if grid_files == 0 then
        fs.remove_all(dest)
        return { ok = false, empty = true, error = "there is no custom artwork to back up" }
    end

    local manifest = cjson.encode({ version = 1, created = os.time(), users = users, grid_files = grid_files, store_files = store_files })
    local manifest_file = io.open(fs.join(dest, MANIFEST), "wb")
    if not manifest_file then
        fs.remove_all(dest)
        return { ok = false, error = "could not write the backup manifest" }
    end
    manifest_file:write(manifest)
    manifest_file:close()

    prune(root, keep, protect_path)
    logger:info(string.format("Backup %s created: %d files for %d users", name, grid_files, users))
    return { ok = true, name = fs.filename(dest), path = normalize(dest), grid_files = grid_files }
end

---Puts a backup's artwork back. Everything currently in place is backed up first,
---so a restore can always be undone.
---@param backup_path string folder containing a manifest.json
---@param safety_root string backup folder to put the safety backup into, empty for the default one
---@param keep number
---@return table result { ok, error?, restored?, skipped_users?, safety_backup? }
function M.restore(backup_path, safety_root, keep)
    backup_path = normalize(backup_path or "")
    if not read_manifest(backup_path) then
        return { ok = false, error = backup_path .. " is not an Easy SteamGrid backup" }
    end

    local safety = M.create(safety_root, keep, "-pre-restore", backup_path)
    local safety_name = safety.ok and safety.name or nil

    local restored, skipped = 0, {}
    local cached_icons = {}
    local grid_root = fs.join(backup_path, GRID_DIR)
    local udata = userdata_path()
    for _, user_entry in ipairs(fs.exists(grid_root) and fs.list(grid_root) or {}) do
        local user_id = fs.filename(user_entry.path)
        local user_dir = fs.join(udata, user_id)
        if user_entry.is_directory and fs.exists(user_dir) then
            local grid_dir = fs.join(user_dir, "config", "grid")
            fs.create_directories(grid_dir)
            for _, file in ipairs(fs.list(user_entry.path) or {}) do
                if file.is_file then
                    remove_matching_stem(grid_dir, fs.stem(file.path))
                    if fs.copy(file.path, fs.join(grid_dir, fs.filename(file.path))) then
                        restored = restored + 1
                    end

                    local icon_appid = string.match(fs.stem(file.path), "^(%d+)_icon$")
                    if icon_appid and not cached_icons[icon_appid] then
                        cached_icons[icon_appid] = true
                        local f = io.open(file.path, "rb")
                        if f then
                            local bytes = f:read("*a")
                            f:close()
                            icons.write_cache_icon(icon_appid, bytes, string.sub(fs.extension(file.path), 2))
                        end
                    end
                end
            end
        elseif user_entry.is_directory then
            table.insert(skipped, user_id)
        end
    end

    local store_root = fs.join(backup_path, STORE_DIR)
    if fs.exists(store_root) then
        fs.create_directories(store_dir())
        for _, file in ipairs(STORE_FILES) do
            local source = fs.join(store_root, file)
            if fs.exists(source) then
                local target = fs.join(store_dir(), file)
                if fs.exists(target) then fs.remove(target) end
                fs.copy(source, target)
            end
        end
    end

    logger:info(string.format("Restored %d files from %s", restored, backup_path))
    return { ok = true, restored = restored, skipped_users = skipped, safety_backup = safety_name }
end

return M
