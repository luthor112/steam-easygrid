import { callable, findModule, sleep, Millennium, Menu, MenuItem, showContextMenu, DialogButton, showModal, SidebarNavigation } from "@steambrew/client";
import { render } from "react-dom";
import React, { useState, useEffect } from "react";

// Backend functions
const get_image = callable<[{ app_name: string, app_id: number, image_type: number, image_num: number, set_current: boolean, is_replace_collection?: boolean }], string>('Backend.get_image');
const get_current_index = callable<[{ app_id: number, image_type: number }], number>('Backend.get_current_index');
const get_max_index = callable<[{ app_id: number, image_type: number }], number>('Backend.get_max_index');
const get_steamgriddb_id = callable<[{ app_id: number }], number>('Backend.get_steamgriddb_id');
const purge_cache = callable<[{ app_id: number }], boolean>('Backend.purge_cache');
const get_thumb_list = callable<[{ app_id: number, image_type: number }], string>('Backend.get_thumb_list');
const get_width_mult = callable<[{ app_id: number, image_type: number }], number>('Backend.get_width_mult');

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
        render(<DialogButton className="easygrid-button" style={{width: "50px"}}>SGDB</DialogButton>, gridButton);
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
        render(<DialogButton className="easygrid-button" style={{width: "50px"}}>SGDB</DialogButton>, gridButton);
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

async function renderApp(popup: any) {
    const topCapsuleDiv = await WaitForElement(`div.${findModule(e => e.TopCapsule).TopCapsule}`, popup.m_popup.document);
    if (!topCapsuleDiv.classList.contains("easygrid-header")) {
        topCapsuleDiv.addEventListener("dblclick", async () => {
            const EasyGridComponent: React.FC = getEasyGridComponent(popup);

            const currentColl = collectionStore.GetCollection(uiStore.currentGameListSelection.strCollectionId);
            const currentApp = currentColl.allApps.find((x) => x.appid === uiStore.currentGameListSelection.nAppId);
            const heroWidthMult = await get_width_mult({app_id: uiStore.currentGameListSelection.nAppId, image_type: 1}) / 100;
            const logoWidthMult = await get_width_mult({app_id: uiStore.currentGameListSelection.nAppId, image_type: 2}) / 100;
            const gridWidthMult = await get_width_mult({app_id: uiStore.currentGameListSelection.nAppId, image_type: 0}) / 100;
            const iconWidthMult = await get_width_mult({app_id: uiStore.currentGameListSelection.nAppId, image_type: 4}) / 100;

            showModal(
                <SidebarNavigation pages={[
                    {title: <div>Hero</div>, content: <EasyGridComponent key="hero_page" appid={uiStore.currentGameListSelection.nAppId} appname={currentApp.display_name} imagetype={1} imageWidthMult={heroWidthMult}/>},
                    {title: <div>Logo</div>, content: <EasyGridComponent key="logo_page" appid={uiStore.currentGameListSelection.nAppId} appname={currentApp.display_name} imagetype={2} imageWidthMult={logoWidthMult}/>},
                    {title: <div>Grid</div>, content: <EasyGridComponent key="grid_page" appid={uiStore.currentGameListSelection.nAppId} appname={currentApp.display_name} imagetype={0} imageWidthMult={gridWidthMult}/>},
                    {title: <div>Wide Grid</div>, content: <EasyGridComponent key="widegrid_page" appid={uiStore.currentGameListSelection.nAppId} appname={currentApp.display_name} imagetype={3} imageWidthMult={gridWidthMult}/>},
                    {title: <div>Icon</div>, content: <EasyGridComponent key="icon_page" appid={uiStore.currentGameListSelection.nAppId} appname={currentApp.display_name} imagetype={4} imageWidthMult={iconWidthMult}/>}
                ]} showTitle={true} title={currentApp.display_name}/>,
                popup.m_popup.window, {strTitle: "EasyGrid", bHideMainWindowForPopouts: false, bForcePopOut: true, popupHeight: 700, popupWidth: 1500}
            );
        });
        topCapsuleDiv.classList.add("easygrid-header");
    }
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

        MainWindowBrowserManager.m_browser.on("finished-request", async (currentURL, previousURL) => {
            if (MainWindowBrowserManager.m_lastLocation.pathname === "/library/home") {
                await renderHome(popup);
            } else if (MainWindowBrowserManager.m_lastLocation.pathname.startsWith("/library/collection/")) {
                await renderCollection(popup);
            } else if (MainWindowBrowserManager.m_lastLocation.pathname.startsWith("/library/app/")) {
                await renderApp(popup);
            }
        });
    }
}

export default async function PluginMain() {
    console.log("[steam-easygrid 3] frontend startup");
    await App.WaitForServicesInitialized();

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
