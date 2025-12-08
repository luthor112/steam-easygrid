import { callable, findModule, sleep, Millennium, Menu, MenuItem, showContextMenu, DialogButton, showModal, SidebarNavigation } from "@steambrew/client";
import { createRoot } from "react-dom/client";
import React, { useState, useEffect } from "react";

// Backend functions
const get_image = callable<[{ app_name: string, app_id: number, image_type: number, image_num: number, set_current: boolean, is_replace_collection?: boolean }], string>('Backend.get_image');
const get_current_index = callable<[{ app_id: number, image_type: number }], number>('Backend.get_current_index');
const get_max_index = callable<[{ app_id: number, image_type: number }], number>('Backend.get_max_index');
const get_steamgriddb_id = callable<[{ app_id: number }], number>('Backend.get_steamgriddb_id');
const purge_cache = callable<[{ app_id: number }], boolean>('Backend.purge_cache');
const get_thumb_list = callable<[{ app_id: number, image_type: number }], string>('Backend.get_thumb_list');
const get_width_mult = callable<[{ app_id: number, image_type: number }], number>('Backend.get_width_mult');
const get_expand_headers_value = callable<[{}], string>('Backend.get_expand_headers_value');
const get_app_page_button = callable<[{}], boolean>('Backend.get_app_page_button');
const get_stagger_main_load = callable<[{}], number>('Backend.get_stagger_main_load');
const get_stagger_page_load = callable<[{}], number>('Backend.get_stagger_page_load');

const WaitForElement = async (sel: string, parent = document) =>
	[...(await Millennium.findElement(parent, sel))][0];

const WaitForElementTimeout = async (sel: string, parent = document, timeOut = 1000) =>
	[...(await Millennium.findElement(parent, sel, timeOut))][0];

const WaitForElementList = async (sel: string, parent = document) =>
	[...(await Millennium.findElement(parent, sel))];

async function getSteamGridDBId(appId: number): Promise<number | undefined> {
    try {
        return await get_steamgriddb_id({ app_id: appId });
    } catch (e) {
        console.error("[steam-easygrid 3] Failed to get SteamGridDB ID:", e);
        return undefined;
    }
}

async function renderHome(popup: any) {
    const headerDiv = await WaitForElement(`div.${findModule(e => e.ShowcaseHeader).ShowcaseHeader}`, popup.m_popup.document);
    const oldGridButton = headerDiv.querySelector('button.easygrid-button');
    if (!oldGridButton) {
        const gridButton = popup.m_popup.document.createElement("div");
        const gridButtonRoot = createRoot(gridButton);
        gridButtonRoot.render(<DialogButton className="easygrid-button" style={{width: "50px"}}>SGDB</DialogButton>);
        headerDiv.insertBefore(gridButton, headerDiv.firstChild.nextSibling.nextSibling);

        gridButton.addEventListener("click", async () => {
            const extraMenuItems = [];
            for (let i = 0; i < collectionStore.userCollections.length; i++) {
                const collId = collectionStore.userCollections[i].m_strId;
                const collName = collectionStore.userCollections[i].m_strName;
                extraMenuItems.push(<MenuItem onClick={async () => {
                    const currentColl = collectionStore.GetCollection(collId);
                    for (let j = 0; j < currentColl.allApps.length; j++) {
                        gridButton.firstChild.innerHTML = `Working... (${j}/${currentColl.allApps.length})`;
                        const newImage = await get_image({app_name: currentColl.allApps[j].display_name, app_id: currentColl.allApps[j].appid, image_type: 0, image_num: 0, set_current: true, is_replace_collection: true});
                        if (newImage !== "") {
                            const newImageParts = newImage.split(";", 2);
                            SteamClient.Apps.SetCustomArtworkForApp(currentColl.allApps[j].appid, newImageParts[1], newImageParts[0], 0);
                        }
                    }
                    gridButton.firstChild.innerHTML = "Done!";
                    console.log("[steam-easygrid 3] Grids replaced for", collId);
                }}> Replace grids of {collName} </MenuItem>);
                extraMenuItems.push(<MenuItem onClick={async () => {
                    const currentColl = collectionStore.GetCollection(collId);
                    for (let j = 0; j < currentColl.allApps.length; j++) {
                        gridButton.firstChild.innerHTML = `Working... (${j}/${currentColl.allApps.length})`;
                        SteamClient.Apps.ClearCustomArtworkForApp(currentColl.allApps[j].appid, 0);
                        await get_image({app_name: currentColl.allApps[j].display_name, app_id: currentColl.allApps[j].appid, image_type: 0, image_num: -1, set_current: true});
                    }
                    gridButton.firstChild.innerHTML = "Done!";
                    console.log("[steam-easygrid 3] Grids cleared for", collId);
                }}> Reset grids of {collName} </MenuItem>);
            }

            showContextMenu(
                <Menu label="EasyGrid Options">
                    {extraMenuItems}
                </Menu>,
                gridButton,
                {bForcePopup: true}
            );
        });
    }
}

async function renderCollection(popup: any) {
    const collOptionsDiv = await WaitForElement(`div.${findModule(e => e.CollectionOptions).CollectionOptions}`, popup.m_popup.document);
    const oldGridButton = collOptionsDiv.querySelector('button.easygrid-button');
    if (!oldGridButton) {
        const gridButton = popup.m_popup.document.createElement("div");
        const gridButtonRoot = createRoot(gridButton);
        gridButtonRoot.render(<DialogButton className="easygrid-button" style={{width: "50px"}}>SGDB</DialogButton>);
        collOptionsDiv.insertBefore(gridButton, collOptionsDiv.firstChild.nextSibling);

        gridButton.addEventListener("click", async () => {
            showContextMenu(
                <Menu label="EasyGrid Options">
                    <MenuItem onClick={async () => {
                        const currentColl = collectionStore.GetCollection(uiStore.currentGameListSelection.strCollectionId);
                        for (let j = 0; j < currentColl.allApps.length; j++) {
                            gridButton.firstChild.innerHTML = `Working... (${j}/${currentColl.allApps.length})`;
                            const newImage = await get_image({app_name: currentColl.allApps[j].display_name, app_id: currentColl.allApps[j].appid, image_type: 0, image_num: 0, set_current: true, is_replace_collection: true});
                            if (newImage !== "") {
                                const newImageParts = newImage.split(";", 2);
                                SteamClient.Apps.SetCustomArtworkForApp(currentColl.allApps[j].appid, newImageParts[1], newImageParts[0], 0);
                            }
                        }
                        gridButton.firstChild.innerHTML = "Done!";
                        console.log("[steam-easygrid 3] Grids replaced for", uiStore.currentGameListSelection.strCollectionId);
                    }}> Replace grids </MenuItem>
                    <MenuItem onClick={async () => {
                        const currentColl = collectionStore.GetCollection(uiStore.currentGameListSelection.strCollectionId);
                        for (let j = 0; j < currentColl.allApps.length; j++) {
                            gridButton.firstChild.innerHTML = `Working... (${j}/${currentColl.allApps.length})`;
                            SteamClient.Apps.ClearCustomArtworkForApp(currentColl.allApps[j].appid, 0);
                            await get_image({app_name: currentColl.allApps[j].display_name, app_id: currentColl.allApps[j].appid, image_type: 0, image_num: -1, set_current: true});
                        }
                        gridButton.firstChild.innerHTML = "Done!";
                        console.log("[steam-easygrid 3] Grids cleared for", uiStore.currentGameListSelection.strCollectionId);
                    }}> Reset grids </MenuItem>
                </Menu>,
                gridButton,
                {bForcePopup: true}
            );
        });
    }
}

function getEasyGridComponent(popup: any) {
    return (props) => {
        const containerStyle: React.CSSProperties = {
            display: 'flex',
            flexWrap: 'wrap',
            overflowX: 'hidden',
            overflowY: 'auto',
            padding: '10px',
            gap: '10px',
            width: '100%'
        };

        const imageWrapperStyle: React.CSSProperties = {
            width: (popup.m_popup.window.screen.width * props.imageWidthMult) + 'px',
            minWidth: "150px",
            height: "auto",
        };

        const imageStyle: React.CSSProperties = {
            width: '100%', // adjust as needed
            height: 'auto',
            objectFit: 'cover',
            borderRadius: '8px'
        };

        const [currentImageNum, setCurrentImageNum] = useState<number>(-1);
        const [maxImageNum, setMaxImageNum] = useState<number>(-1);
        const [thumbnailList, setThumbnailList] = useState([]);

        const GetCurrentSettings = async () => {
            await get_image({
                app_name: props.appname,
                app_id: props.appid,
                image_type: props.imagetype,
                image_num: -1,
                set_current: false
            });

            setCurrentImageNum(await get_current_index({
                app_id: props.appid,
                image_type: props.imagetype
            }));
            setMaxImageNum(await get_max_index({
                app_id: props.appid,
                image_type: props.imagetype
            }));
            setThumbnailList(JSON.parse(await get_thumb_list({
                app_id: props.appid,
                image_type: props.imagetype
            })));
        };

        const PurgeImageCache = async () => {
            console.log("[steam-easygrid 3] Purging cache and reloading...");
            await purge_cache({app_id: props.appid});
            GetCurrentSettings();
        };

        const SetNewImage = async (e) => {
            const targetNum = Number(e.target.dataset.imageindex);
            console.log("[steam-easygrid 3] Setting image to:", targetNum);
            const newImage = await get_image({
                app_name: props.appname,
                app_id: props.appid,
                image_type: props.imagetype,
                image_num: targetNum,
                set_current: true
            });
            if (newImage !== "") {
                const newImageParts = newImage.split(";", 2);
                SteamClient.Apps.SetCustomArtworkForApp(props.appid, newImageParts[1], newImageParts[0], props.imagetype);
                setCurrentImageNum(targetNum);
            }
        };

        const SetOriginalImage = async (e) => {
            console.log("[steam-easygrid 3] Resetting image...");
            SteamClient.Apps.ClearCustomArtworkForApp(props.appid, props.imagetype);
            await get_image({
                app_name: props.appname,
                app_id: props.appid,
                image_type: props.imagetype,
                image_num: -1,
                set_current: true
            });
            setCurrentImageNum(-1);
        };

        const OpenWebpage = async () => {
            console.log("[steam-easygrid 3] Opening SGDB Webpage...");
            const sgdbGameId = await getSteamGridDBId(props.appid);
            window.open(`https://www.steamgriddb.com/game/${sgdbGameId}`, "_blank");
        };

        useEffect(() => {
            GetCurrentSettings();
        }, []);

        return (
            <div>
                App ID: {props.appid} / App Name: {props.appname} / Image
                Type: {props.imagetype} <br/>
                Current: {currentImageNum} / Max: {maxImageNum} <br/>
                <DialogButton style={{width: "120px", display: "inline-block"}} onClick={SetOriginalImage}>Reset</DialogButton> &nbsp;
                <DialogButton style={{width: "120px", display: "inline-block"}} onClick={PurgeImageCache}>Purge Cache</DialogButton> &nbsp;
                <DialogButton style={{width: "120px", display: "inline-block"}} onClick={OpenWebpage}>Open Webpage</DialogButton><br/>
                <div style={containerStyle}>
                    {thumbnailList.map((thumbData, index) => {
                        if (thumbData[1] === "static")
                            return (
                                <div style={imageWrapperStyle}>
                                    <img key={index} data-imageindex={index} src={thumbData[0]} alt={thumbData[1]} style={imageStyle} onClick={SetNewImage}/>
                                </div>
                            );

                        return (
                            <div style={imageWrapperStyle}>
                                <video key={index} data-imageindex={index} autoPlay loop muted playsInline src={thumbData[0]} alt={thumbData[1]} style={imageStyle} onClick={SetNewImage}/>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };
}

async function openSGDBWindow(popup: any) {
    const EasyGridComponent: React.FC = getEasyGridComponent(popup);

    const currentColl = collectionStore.GetCollection(uiStore.currentGameListSelection.strCollectionId);
    const currentApp = currentColl.allApps.find((x) => x.appid === uiStore.currentGameListSelection.nAppId);
    const heroWidthMult = await get_width_mult({app_id: uiStore.currentGameListSelection.nAppId, image_type: 1}) / 100;
    const logoWidthMult = await get_width_mult({app_id: uiStore.currentGameListSelection.nAppId, image_type: 2}) / 100;
    const gridWidthMult = await get_width_mult({app_id: uiStore.currentGameListSelection.nAppId, image_type: 0}) / 100;
    const iconWidthMult = await get_width_mult({app_id: uiStore.currentGameListSelection.nAppId, image_type: 4}) / 100;

    // Removed for now:
    // {title: <div>Icon</div>, content: <EasyGridComponent key="icon_page" appid={uiStore.currentGameListSelection.nAppId} appname={currentApp.display_name} imagetype={4} imageWidthMult={iconWidthMult}/>}
    showModal(
        <SidebarNavigation pages={[
            {title: <div>Hero</div>, content: <EasyGridComponent key="hero_page" appid={uiStore.currentGameListSelection.nAppId} appname={currentApp.display_name} imagetype={1} imageWidthMult={heroWidthMult}/>},
            {title: <div>Logo</div>, content: <EasyGridComponent key="logo_page" appid={uiStore.currentGameListSelection.nAppId} appname={currentApp.display_name} imagetype={2} imageWidthMult={logoWidthMult}/>},
            {title: <div>Grid</div>, content: <EasyGridComponent key="grid_page" appid={uiStore.currentGameListSelection.nAppId} appname={currentApp.display_name} imagetype={0} imageWidthMult={gridWidthMult}/>},
            {title: <div>Wide Grid</div>, content: <EasyGridComponent key="widegrid_page" appid={uiStore.currentGameListSelection.nAppId} appname={currentApp.display_name} imagetype={3} imageWidthMult={gridWidthMult}/>}
        ]} showTitle={true} title={currentApp.display_name}/>,
        popup.m_popup.window, {strTitle: "EasyGrid", bHideMainWindowForPopouts: false, bForcePopOut: true, popupHeight: 700, popupWidth: 1500}
    );
}

async function renderApp(popup: any) {
    const topCapsuleDiv = await WaitForElement(`div.${findModule(e => e.TopCapsule).TopCapsule}`, popup.m_popup.document);
    if (!topCapsuleDiv.classList.contains("easygrid-header")) {
        topCapsuleDiv.addEventListener("dblclick", async() => {
            openSGDBWindow(popup);
        });
        topCapsuleDiv.classList.add("easygrid-header");
    }

    const appPageButtonEnabled = await get_app_page_button({});
    if (appPageButtonEnabled) {
        const gameSettingsButton = await WaitForElement(`div.${findModule(e => e.InPage).InPage} div.${findModule(e => e.AppButtonsContainer).AppButtonsContainer} > div.${findModule(e => e.MenuButtonContainer).MenuButtonContainer}:not([role="button"])`, popup.m_popup.document);
        const oldGridButton = gameSettingsButton.parentNode.querySelector('div.easygrid-button');
        if (!oldGridButton) {
            const gridButton = gameSettingsButton.cloneNode(true);
            gridButton.classList.add("easygrid-button");
            gridButton.firstChild.innerHTML = "SG";
            gameSettingsButton.parentNode.insertBefore(gridButton, gameSettingsButton.nextSibling);

            gridButton.addEventListener("click", async () => {
                showContextMenu(
                    <Menu label="SGDB Options">
                        <MenuItem onClick={async () => {
                            const currentColl = collectionStore.GetCollection(uiStore.currentGameListSelection.strCollectionId);
                            const currentApp = currentColl.allApps.find((x) => x.appid === uiStore.currentGameListSelection.nAppId);

                            //const allImageTypes = 5;
                            const allImageTypes = 4;    // Icons are disabled for now
                            for (let j = 0; j < allImageTypes; j++) {
                                gridButton.firstChild.innerHTML = `${j}/${allImageTypes}`;
                                const newImage = await get_image({app_name: currentApp.display_name, app_id: uiStore.currentGameListSelection.nAppId, image_type: j, image_num: 0, set_current: true});
                                if (newImage !== "") {
                                    const newImageParts = newImage.split(";", 2);
                                    SteamClient.Apps.SetCustomArtworkForApp(uiStore.currentGameListSelection.nAppId, newImageParts[1], newImageParts[0], j);
                                }
                            }
                            gridButton.firstChild.innerHTML = "SG";
                            console.log("[steam-easygrid 3] Images replaced for", uiStore.currentGameListSelection.nAppId);
                        }}> Auto replace images </MenuItem>
                        <MenuItem onClick={async () => {
                            openSGDBWindow(popup);
                        }}> Open window </MenuItem>
                    </Menu>,
                    gridButton,
                    { bForcePopup: true }
                );
            });
        }
    }

    const expandHeadersValue = await get_expand_headers_value({});
    if (expandHeadersValue !== "") {
        for (const el of popup.m_popup.document.querySelectorAll(`*:has(> .${findModule(e => e.ImgSrc).ImgSrc})`)) {
            el.style.setProperty("height", "auto", "important");
        }

        topCapsuleDiv.style.setProperty("max-height", expandHeadersValue, "important");

        for (const el of popup.m_popup.document.querySelectorAll(`.${findModule(e => e.BoxSizer).BoxSizer} img`)) {
            el.style.setProperty("width", "50%", "important");
            el.style.setProperty("height", "50%", "important");
            el.style.setProperty("margin-bottom", "100px", "important");
        }

        for (const el of popup.m_popup.document.querySelectorAll(`.${findModule(e => e.TitleSection).TitleSection}`)) {
            el.style.setProperty("bottom", "100px", "important");
        }
    }
}

async function renderAppAndObserve(popup: any) {
    await renderApp(popup);

    const topCapsuleDiv = await WaitForElement(`div.${findModule(e => e.TopCapsule).TopCapsule}`, popup.m_popup.document);
    const topCapsuleObserver = new MutationObserver(async (mutationList, observer) => {
        await renderApp(popup);
    });
    topCapsuleObserver.observe(topCapsuleDiv.parentNode, { subtree: true, childList: true, attributes: true });
}

async function OnPopupCreation(popup: any) {
    if (popup.m_strName === "SP Desktop_uid0") {
        var mwbm = undefined;
        while (!mwbm) {
            console.log("[steam-easygrid 3] Waiting for MainWindowBrowserManager");
            try {
                mwbm = MainWindowBrowserManager;
            } catch {
                await sleep(100);
            }
        }

        console.log("[steam-easygrid 3] Registering callback");
        MainWindowBrowserManager.m_browser.on("finished-request", async (currentURL, previousURL) => {
            if (MainWindowBrowserManager.m_lastLocation.pathname === "/library/home" || MainWindowBrowserManager.m_lastLocation.pathname.startsWith("/library/collection/") || MainWindowBrowserManager.m_lastLocation.pathname.startsWith("/library/app/")) {
                const staggerPageLoad = await get_stagger_page_load({});
                if (staggerPageLoad > 0) {
                    console.log("[steam-easygrid 3] Staggering page load by", staggerPageLoad);
                    await sleep(staggerPageLoad);
                }
            }

            if (MainWindowBrowserManager.m_lastLocation.pathname === "/library/home") {
                await renderHome(popup);
            } else if (MainWindowBrowserManager.m_lastLocation.pathname.startsWith("/library/collection/")) {
                await renderCollection(popup);
            } else if (MainWindowBrowserManager.m_lastLocation.pathname.startsWith("/library/app/")) {
                await renderAppAndObserve(popup);
            }
        });
    }
}

export default async function PluginMain() {
    console.log("[steam-easygrid 3] frontend startup");
    await App.WaitForServicesInitialized();

    const staggerMainLoad = await get_stagger_main_load({});
    if (staggerMainLoad > 0) {
        console.log("[steam-easygrid 3] Staggering main load by", staggerMainLoad);
        await sleep(staggerMainLoad);
    }

    while (
        typeof g_PopupManager === 'undefined' ||
        typeof MainWindowBrowserManager === 'undefined'
    ) {
        await sleep(100);
    }

    const doc = g_PopupManager.GetExistingPopup("SP Desktop_uid0");
	if (doc) {
		OnPopupCreation(doc);
	}

	g_PopupManager.AddPopupCreatedCallback(OnPopupCreation);
}
