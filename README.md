# Easy SteamGrid

A Millennium plugin that adds quick and easy SteamGridDB integration to Steam.

## Features
- Replace or reset grid images for all apps in a collection with ones from SteamGridDB
- Switch the header image, logo or grid image of an app with ones from SteamGridDB via a window opened by double-clicking the header

## Configuration
- Configuration file: `<STEAM>\plugins\steam-easygrid\config.json`
- Set `api_key` to your [SteamGridDB API key](https://www.steamgriddb.com/profile/preferences/api)
- Fallback to searching by name can be disabled by setting `display_name_fallback` to `false`
- When replacing all grid images in a collection, to disable skipping apps with a custom grid already set by the plugin, set `replace_custom_images` to `false`
- When replacing all grid images in a collection, to skip a given app, add it to the `appids_excluded_from_replacement` list
- To prioritize animated images, set `prioritize_animated` to `true`
- `grids_config`, `heroes_config` and `logos_config` can be set to a dictionary with any extra parameters you want to add to the API queries

## Prerequisites
- [Millennium](https://steambrew.app/)
- [SteamGridDB API key](https://www.steamgriddb.com/profile/preferences/api)

## Known issues:
- Be patient, every change can take a couple seconds

## Contributors

<a href="https://github.com/luthor112/steam-easygrid/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=luthor112/steam-easygrid" />
</a>

Made with [contrib.rocks](https://contrib.rocks).

## HowTo/Screenshots/Problemsolving

# First run

- Get your [SteamGridDB API key](https://www.steamgriddb.com/profile/preferences/api)
- Fill the field `api_key` in `<STEAM>\plugins\steam-easygrid\config.json`
- Restart Steam

# Using Grid images from SteamGridDB for entire Collections - from Home

- In the Steam Library, search for the `SGDB` button
- The button should look like the one here (on the default skin):

![SGDB button](screenshots/sgdb-button.png)

- Click the button and select a Collection to work on - example list:

![Example collection list](screenshots/sgdb-collections.png)

- The progress will be displayed while working - example:

![Searching for Grid images](screenshots/grid-working.png)

# Using Grid images from SteamGridDB for entire Collections - from a Collection

- Select a collection (using the Collections page or the left pane)
- Search for the `SGDB` button, it should look like this (on the default skin):

![SGDB button](screenshots/sgdb-coll-button.png)

- Click the `SGDB` button and select your course of action: replace or reset all Grid images in the collection
- The progress will be displayed while working

# Using Headers (heroes), Logos and Grids from SteamGridDB

- Double-click the header of an app
- A window should appear with the settings
    - The window appears as such:

![Settings window](screenshots/header-window.png)

- The following controls are shown:
    - Number selectors for the Hero (header), Logo and Grid
    - `Purge Cache` button: Purges all cached links and files for the given app, forcing a new search and new downloads
        - This is a good first try when something stops working
    - Below the `Purge Cache` button, the currently selected Grid image is displayed (if any)
- Image numbers start at 0, with -1 meaning "not set"

## Troubleshooting

When someting stop working, a good first step is to try pruging the cache of the given app:
- Double-click the header of the app
- Click `Purge Cache`, this will purge cached links and files, hopefully fixing the problem