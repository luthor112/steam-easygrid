# Easy SteamGrid

A Millennium plugin that adds quick and easy SteamGridDB integration to Steam.

## Features
- Replace or reset grid images for all apps in a collection with ones from SteamGridDB
- Switch the header image or logo of an app via double-click with one from SteamGridDB

## Configuration
- Configuration file: `<STEAM>\plugins\steam-easygrid\config.json`
- Set `api_key` to your [SteamGridDB API key](https://www.steamgriddb.com/profile/preferences/api)
- `filetype` can be set to a supported filetype (set to `png` by default)
- Fallback to searching by name can be disabled by setting `display_name_fallback` to `false`
- `extra_config` can be set to a dictionary with any extra parameters you want to add to the API queries

## Prerequisites
- [Millennium](https://steambrew.app/)

## Known issues:
- The new menu button doesn't alway appear the first time the Library tab is opened
- Be patient, every change can take a couple seconds