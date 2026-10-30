local M = {}

local PNG_SIGNATURE = "\137\80\78\71\13\10\26\10"

local function read_u16(bytes, offset)
    local b1, b2 = string.byte(bytes, offset + 1, offset + 2)
    return (b1 or 0) + (b2 or 0) * 256
end

local function read_u32(bytes, offset)
    local b1, b2, b3, b4 = string.byte(bytes, offset + 1, offset + 4)
    return (b1 or 0) + (b2 or 0) * 256 + (b3 or 0) * 65536 + (b4 or 0) * 16777216
end

local function read_i32(bytes, offset)
    local value = read_u32(bytes, offset)
    if value >= 2147483648 then value = value - 4294967296 end
    return value
end

local function read_be32(bytes, offset)
    local b1, b2, b3, b4 = string.byte(bytes, offset + 1, offset + 4)
    return (b1 or 0) * 16777216 + (b2 or 0) * 65536 + (b3 or 0) * 256 + (b4 or 0)
end

local function write_be32(value)
    return string.char(math.floor(value / 16777216) % 256, math.floor(value / 65536) % 256, math.floor(value / 256) % 256, value % 256)
end

local xor_table = nil
local crc_table = nil

local function build_tables()
    if xor_table then return end

    xor_table = {}
    for a = 0, 255 do
        for b = 0, 255 do
            local result, bit, x, y = 0, 1, a, b
            for _ = 1, 8 do
                local xb, yb = x % 2, y % 2
                if xb ~= yb then result = result + bit end
                x = (x - xb) / 2
                y = (y - yb) / 2
                bit = bit * 2
            end
            xor_table[a * 256 + b] = result
        end
    end

    crc_table = {}
    for n = 0, 255 do
        local c = n
        for _ = 1, 8 do
            if c % 2 == 1 then
                c = M.xor32(3988292384, math.floor(c / 2))
            else
                c = math.floor(c / 2)
            end
        end
        crc_table[n] = c
    end
end

function M.xor32(a, b)
    local result, multiplier = 0, 1
    for _ = 1, 4 do
        local ab, bb = a % 256, b % 256
        result = result + xor_table[ab * 256 + bb] * multiplier
        a = (a - ab) / 256
        b = (b - bb) / 256
        multiplier = multiplier * 256
    end
    return result
end

local function crc32(data)
    local crc = 4294967295
    for i = 1, #data do
        local low = crc % 256
        local index = xor_table[low * 256 + string.byte(data, i)]
        crc = M.xor32(crc_table[index], (crc - low) / 256)
    end
    return 4294967295 - crc
end

local function adler32(data)
    local a, b = 1, 0
    for i = 1, #data do
        a = (a + string.byte(data, i)) % 65521
        b = (b + a) % 65521
    end
    return b * 65536 + a
end

local function zlib_store(raw)
    local out = { "\120\1" }
    local position, length = 1, #raw
    if length == 0 then
        out[#out + 1] = "\1\0\0\255\255"
    end
    while position <= length do
        local chunk = string.sub(raw, position, position + 65534)
        local size = #chunk
        local final = (position + size > length) and 1 or 0
        local inverse = 65535 - size
        out[#out + 1] = string.char(final, size % 256, math.floor(size / 256), inverse % 256, math.floor(inverse / 256)) .. chunk
        position = position + size
    end
    out[#out + 1] = write_be32(adler32(raw))
    return table.concat(out)
end

local function png_chunk(kind, data)
    return write_be32(#data) .. kind .. data .. write_be32(crc32(kind .. data))
end

local function encode_png_rgba(width, height, scanlines)
    local header = write_be32(width) .. write_be32(height) .. "\8\6\0\0\0"
    return PNG_SIGNATURE
        .. png_chunk("IHDR", header)
        .. png_chunk("IDAT", zlib_store(scanlines))
        .. png_chunk("IEND", "")
end

local function dib_geometry(chunk)
    if #chunk < 40 then return nil end
    local header_size = read_u32(chunk, 0)
    if header_size < 40 or header_size > #chunk then return nil end

    local width = read_i32(chunk, 4)
    local full_height = read_i32(chunk, 8)
    if width <= 0 or full_height == 0 then return nil end

    return {
        header_size = header_size,
        width = width,
        top_down = full_height < 0,
        full_height = math.abs(full_height),
        bits = read_u16(chunk, 14),
        compression = read_u32(chunk, 16),
        colors_used = read_u32(chunk, 32),
    }
end

local function frame_height(geo, entry_height)
    if entry_height and geo.full_height == entry_height then
        return geo.full_height, false
    end
    return math.floor(geo.full_height / 2), true
end

local function decode_dib(chunk, entry_height)
    local geo = dib_geometry(chunk)
    if not geo or geo.compression ~= 0 then return nil end

    local bits, width = geo.bits, geo.width
    if bits ~= 1 and bits ~= 4 and bits ~= 8 and bits ~= 24 and bits ~= 32 then return nil end

    local palette_offset = geo.header_size
    local palette = {}
    local pixel_offset = palette_offset
    if bits <= 8 then
        local count = geo.colors_used > 0 and geo.colors_used or (2 ^ bits)
        if count > 2 ^ bits then count = 2 ^ bits end
        for i = 0, count - 1 do
            local b, g, r = string.byte(chunk, palette_offset + i * 4 + 1, palette_offset + i * 4 + 3)
            palette[i] = { r or 0, g or 0, b or 0 }
        end
        pixel_offset = palette_offset + count * 4
    end

    local xor_stride = math.floor((width * bits + 31) / 32) * 4
    local mask_stride = math.floor((width + 31) / 32) * 4

    local height, has_mask = frame_height(geo, entry_height)
    if has_mask and #chunk < pixel_offset + (xor_stride + mask_stride) * height then
        height, has_mask = geo.full_height, false
    end
    if height <= 0 or #chunk < pixel_offset + xor_stride * height then return nil end

    local mask_offset = pixel_offset + xor_stride * height

    local function source_row(y)
        return geo.top_down and y or (height - 1 - y)
    end

    local function mask_transparent(y, x)
        if not has_mask then return false end
        local row = source_row(y)
        local byte = string.byte(chunk, mask_offset + row * mask_stride + math.floor(x / 8) + 1) or 0
        return math.floor(byte / (2 ^ (7 - x % 8))) % 2 == 1
    end

    local use_alpha_channel = false
    if bits == 32 then
        for y = 0, height - 1 do
            local row_offset = pixel_offset + source_row(y) * xor_stride
            for x = 0, width - 1 do
                if (string.byte(chunk, row_offset + x * 4 + 4) or 0) ~= 0 then
                    use_alpha_channel = true
                    break
                end
            end
            if use_alpha_channel then break end
        end
    end

    local rows = {}
    for y = 0, height - 1 do
        local row_offset = pixel_offset + source_row(y) * xor_stride
        local row = { "\0" }
        for x = 0, width - 1 do
            local r, g, b, a
            if bits == 32 then
                b, g, r, a = string.byte(chunk, row_offset + x * 4 + 1, row_offset + x * 4 + 4)
                if not use_alpha_channel then a = mask_transparent(y, x) and 0 or 255 end
            elseif bits == 24 then
                b, g, r = string.byte(chunk, row_offset + x * 3 + 1, row_offset + x * 3 + 3)
                a = mask_transparent(y, x) and 0 or 255
            else
                local per_byte = 8 / bits
                local byte = string.byte(chunk, row_offset + math.floor(x / per_byte) + 1) or 0
                local shift = (per_byte - 1 - x % per_byte) * bits
                local index = math.floor(byte / (2 ^ shift)) % (2 ^ bits)
                local color = palette[index] or { 0, 0, 0 }
                r, g, b = color[1], color[2], color[3]
                a = mask_transparent(y, x) and 0 or 255
            end
            row[#row + 1] = string.char(r or 0, g or 0, b or 0, a or 255)
        end
        rows[#rows + 1] = table.concat(row)
    end

    return width, height, table.concat(rows)
end

function M.ico_to_png(bytes)
    if #bytes < 6 then return nil, "file too small" end
    if read_u16(bytes, 0) ~= 0 or read_u16(bytes, 2) ~= 1 then return nil, "not an ICO file" end

    build_tables()

    local candidates = {}
    for i = 0, read_u16(bytes, 4) - 1 do
        local entry_offset = 6 + i * 16
        if entry_offset + 16 > #bytes then break end

        local data_size = read_u32(bytes, entry_offset + 8)
        local data_offset = read_u32(bytes, entry_offset + 12)
        if data_size > 0 and data_offset + data_size <= #bytes then
            local chunk = string.sub(bytes, data_offset + 1, data_offset + data_size)
            if string.sub(chunk, 1, 8) == PNG_SIGNATURE then
                local width, height = read_be32(chunk, 16), read_be32(chunk, 20)
                candidates[#candidates + 1] = { chunk = chunk, is_png = true, area = width * height, depth = 32, index = i }
            else
                local geo = dib_geometry(chunk)
                if geo then
                    local entry_height = string.byte(bytes, entry_offset + 2)
                    if entry_height == 0 then entry_height = 256 end
                    local height = frame_height(geo, entry_height)
                    candidates[#candidates + 1] = { chunk = chunk, is_png = false, area = geo.width * height, depth = geo.bits, entry_height = entry_height, index = i }
                end
            end
        end
    end

    table.sort(candidates, function(a, b)
        if a.area ~= b.area then return a.area > b.area end
        if a.depth ~= b.depth then return a.depth > b.depth end
        if a.is_png ~= b.is_png then return a.is_png end
        return a.index < b.index
    end)

    for _, candidate in ipairs(candidates) do
        if candidate.is_png then
            return candidate.chunk
        end
        local width, height, scanlines = decode_dib(candidate.chunk, candidate.entry_height)
        if width then
            return encode_png_rgba(width, height, scanlines)
        end
    end

    return nil, "no supported frame"
end

return M
