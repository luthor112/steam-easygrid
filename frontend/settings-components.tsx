import { Field, TextField, Toggle, Dropdown, DialogCheckbox, DialogButton } from "@steambrew/client";
import { createPortal } from "react-dom";
import React, { useState, useEffect, useRef } from "react";
import {
    pluginConfig, persistConfig, imageSearchOptionsByConfigKey, TYPE_OPTIONS, imgTypeSettingsMap,
    resetImageTypeConfig, resetGlobalSettings,
    type PluginConfig, type ImageTypeSubConfig, type BoolKeys, type StringKeys, type NumKeys, type StringArrayKeys,
} from "./config";

type SettingFieldProps = {
    label: string;
    description: string;
    useTooltip?: boolean;
    children: React.ReactNode;
};

const SettingField = (props: SettingFieldProps) => (
    <div title={props.useTooltip ? props.description : undefined}>
        <Field label={props.label} description={props.useTooltip ? undefined : props.description} bottomSeparator="standard" focusable>
            {props.children}
        </Field>
    </div>
);

type SingleSettingProps =
    | { type: "bool"; name: BoolKeys; label: string; description: string; readonly?: boolean; onSaved?: () => void; useTooltip?: boolean }
    | { type: "text"; name: StringKeys; label: string; description: string; readonly?: boolean; onSaved?: () => void; useTooltip?: boolean }
    | { type: "num"; name: NumKeys; label: string; description: string; readonly?: boolean; onSaved?: () => void; useTooltip?: boolean }
    | { type: "textchild"; name: keyof ImageTypeSubConfig; parentname: keyof PluginConfig; label: string; description: string; readonly?: boolean; onSaved?: () => void; useTooltip?: boolean }
    | { type: "array"; name: StringArrayKeys; label: string; description: string; readonly?: boolean; onSaved?: () => void; useTooltip?: boolean };

export const SingleSetting = (props: SingleSettingProps) => {
    const [boolValue, setBoolValue] = useState(false);
    const [isDisabled, setIsDisabled] = useState(false);

    const saveConfig = () => {
        persistConfig();
        props.onSaved?.();
    };

    useEffect(() => {
        if (props.type === "bool") {
            setBoolValue(pluginConfig[props.name]);
        }

        if (props.readonly) {
            setIsDisabled(true);
        }
    }, []);

    if (props.type === "bool") {
        return (
            <SettingField label={props.label} description={props.description} useTooltip={props.useTooltip}>
                <Toggle disabled={isDisabled} value={boolValue} onChange={(value) => { setBoolValue(value); pluginConfig[props.name] = value; saveConfig(); }} />
            </SettingField>
        );
    } else if (props.type === "text") {
        return (
            <SettingField label={props.label} description={props.description} useTooltip={props.useTooltip}>
                <TextField style={{ width: "100%", boxSizing: "border-box" }} disabled={isDisabled} defaultValue={pluginConfig[props.name]} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { pluginConfig[props.name] = e.currentTarget.value; saveConfig(); }} />
            </SettingField>
        );
    } else if (props.type === "num") {
        return (
            <SettingField label={props.label} description={props.description} useTooltip={props.useTooltip}>
                <TextField style={{ width: "100%", boxSizing: "border-box" }} disabled={isDisabled} mustBeNumeric={true} defaultValue={pluginConfig[props.name].toString()} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { pluginConfig[props.name] = Number(e.currentTarget.value); saveConfig(); }} />
            </SettingField>
        );
    } else if (props.type === "textchild") {
        return (
            <SettingField label={props.label} description={props.description} useTooltip={props.useTooltip}>
                <TextField style={{ width: "100%", boxSizing: "border-box" }} disabled={isDisabled} defaultValue={(pluginConfig[props.parentname] as ImageTypeSubConfig)[props.name]} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { (pluginConfig[props.parentname] as ImageTypeSubConfig)[props.name] = e.currentTarget.value; saveConfig(); }} />
            </SettingField>
        );
    } else if (props.type === "array") {
        return (
            <SettingField label={props.label} description={props.description} useTooltip={props.useTooltip}>
                <TextField style={{ width: "100%", boxSizing: "border-box" }} disabled={isDisabled} defaultValue={pluginConfig[props.name].join(", ")} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { pluginConfig[props.name] = e.currentTarget.value.split(",").map(s => s.trim()).filter(s => s.length > 0); saveConfig(); }} />
            </SettingField>
        );
    } else {
        return (
            <div>This should not happen...</div>
        );
    }
}

const TRI_STATE_OPTIONS = [
    { label: "Any", data: "any" },
    { label: "True", data: "true" },
    { label: "False", data: "false" },
];

type TriStateSettingProps = {
    parentname: keyof PluginConfig;
    fieldName: "nsfw" | "humor" | "epilepsy";
    label: string;
    onSaved?: () => void;
    useTooltip?: boolean;
};

const TriStateSetting = (props: TriStateSettingProps) => {
    const [value, setValue] = useState<string>((pluginConfig[props.parentname] as ImageTypeSubConfig)[props.fieldName]);

    return (
        <SettingField label={props.label} description="Any / True / False" useTooltip={props.useTooltip}>
            <Dropdown
                rgOptions={TRI_STATE_OPTIONS}
                selectedOption={value}
                onChange={(option: { data: string }) => {
                    setValue(option.data);
                    (pluginConfig[props.parentname] as ImageTypeSubConfig)[props.fieldName] = option.data;
                    persistConfig();
                    props.onSaved?.();
                }}
            />
        </SettingField>
    );
};

type MultiToggleSettingProps = {
    parentname: keyof PluginConfig;
    fieldName: "types" | "mimes" | "styles";
    label: string;
    options: string[];
    onSaved?: () => void;
    useTooltip?: boolean;
};

const MultiToggleSetting = (props: MultiToggleSettingProps) => {
    const [selected, setSelected] = useState<string[]>(
        (pluginConfig[props.parentname] as ImageTypeSubConfig)[props.fieldName].split(",").map((s) => s.trim()).filter((s) => s.length > 0)
    );
    const [open, setOpen] = useState(false);
    const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
    const containerRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const updatePanelPosition = () => {
        const rect = containerRef.current?.getBoundingClientRect();
        const win = containerRef.current?.ownerDocument?.defaultView;
        if (!rect || !win) return;
        const desiredWidth = Math.max(rect.width, 220);
        const overflowsRight = rect.left + desiredWidth > win.innerWidth - 8;
        setPanelStyle({
            position: 'fixed',
            top: rect.bottom + 2,
            minWidth: desiredWidth,
            maxWidth: 320,
            ...(overflowsRight
                ? { right: Math.max(win.innerWidth - rect.right, 8) }
                : { left: rect.left }),
        });
    };

    useEffect(() => {
        if (!open) return undefined;
        updatePanelPosition();
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (containerRef.current?.contains(target)) return;
            if (panelRef.current?.contains(target)) return;
            setOpen(false);
        };
        const doc = containerRef.current?.ownerDocument ?? document;
        const win = doc.defaultView ?? window;
        doc.addEventListener("mousedown", handleClickOutside);
        win.addEventListener("resize", updatePanelPosition);
        return () => {
            doc.removeEventListener("mousedown", handleClickOutside);
            win.removeEventListener("resize", updatePanelPosition);
        };
    }, [open]);

    const toggleOption = (value: string) => {
        setSelected((prev) => {
            const next = prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value];
            (pluginConfig[props.parentname] as ImageTypeSubConfig)[props.fieldName] = next.join(",");
            persistConfig();
            props.onSaved?.();
            return next;
        });
    };

    const summaryLabel = selected.length === 0 ? "None"
        : selected.length === props.options.length ? "All"
        : `${selected.length} of ${props.options.length}`;

    const bodyDoc = containerRef.current?.ownerDocument;

    return (
        <SettingField label={props.label} description="Toggle to include/exclude" useTooltip={props.useTooltip}>
            <div ref={containerRef} style={{ width: '100%' }}>
                <button
                    type="button"
                    role="combobox"
                    aria-expanded={open}
                    className="DialogDropDown _DialogInputContainer Focusable"
                    style={{ width: '100%' }}
                    onClick={() => setOpen((v) => !v)}
                >
                    <div className="DialogDropDown_CurrentDisplay">{summaryLabel}</div>
                    <div className="DialogDropDown_Arrow">
                        <svg xmlns="http://www.w3.org/2000/svg" className="SVGIcon_Button SVGIcon_DownArrowContextMenu" data-name="Layer 1" viewBox="0 0 128 128" x="0px" y="0px" role="presentation">
                            <polygon points="50 59.49 13.21 22.89 4.74 31.39 50 76.41 95.26 31.39 86.79 22.89 50 59.49"></polygon>
                        </svg>
                    </div>
                </button>
                {open && bodyDoc && createPortal(
                    <div
                        ref={panelRef}
                        className="_30wJO3MC4x-I1OWpy1TAeE _DialogInputContainer"
                        style={{
                            ...panelStyle, boxSizing: 'border-box',
                            zIndex: 10000, maxHeight: '240px', overflowY: 'auto',
                            borderRadius: '4px', padding: '4px',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                        }}
                    >
                        {props.options.map((opt) => (
                            <DialogCheckbox
                                key={opt}
                                label={opt}
                                checked={selected.includes(opt)}
                                controlled
                                bottomSeparator="none"
                                onChange={() => toggleOption(opt)}
                            />
                        ))}
                    </div>,
                    bodyDoc.body
                )}
            </div>
        </SettingField>
    );
};

type ImageSearchSettingProps = {
    imgType: number;
    label: string;
    resetVersion: number;
    onSaved?: () => void;
    useTooltip?: boolean;
    hideTypePrefix?: boolean;
};

export function useImageTypeReset(imgType: number, onSaved?: () => void): [number, () => void] {
    const [resetVersion, setResetVersion] = useState(0);
    const handleReset = () => {
        resetImageTypeConfig(imgType);
        setResetVersion((v) => v + 1);
        onSaved?.();
    };
    return [resetVersion, handleReset];
}

export const ImageSearchSetting = (props: ImageSearchSettingProps) => {
    const { configKey, widthMultKey } = imgTypeSettingsMap[props.imgType];
    const options = imageSearchOptionsByConfigKey[configKey as string];
    const prefix = props.hideTypePrefix ? "" : `${props.label} :: `;

    return (
        <React.Fragment key={props.resetVersion}>
            <TriStateSetting parentname={configKey} fieldName="nsfw" label={`${prefix}NSFW`} onSaved={props.onSaved} useTooltip={props.useTooltip} />
            <TriStateSetting parentname={configKey} fieldName="humor" label={`${prefix}Humor`} onSaved={props.onSaved} useTooltip={props.useTooltip} />
            <TriStateSetting parentname={configKey} fieldName="epilepsy" label={`${prefix}Epilepsy`} onSaved={props.onSaved} useTooltip={props.useTooltip} />
            <MultiToggleSetting parentname={configKey} fieldName="types" label={`${prefix}Types`} options={TYPE_OPTIONS} onSaved={props.onSaved} useTooltip={props.useTooltip} />
            <MultiToggleSetting parentname={configKey} fieldName="mimes" label={`${prefix}Mimes`} options={options.mimeOptions} onSaved={props.onSaved} useTooltip={props.useTooltip} />
            <MultiToggleSetting parentname={configKey} fieldName="styles" label={`${prefix}Styles`} options={options.styleOptions} onSaved={props.onSaved} useTooltip={props.useTooltip} />
            <SingleSetting name="dimensions" parentname={configKey} type="textchild" label={`${prefix}Dimensions`} description="Comma separated" onSaved={props.onSaved} useTooltip={props.useTooltip} />
            <SingleSetting name={widthMultKey} type="num" label={props.hideTypePrefix ? "Width Scale" : `${props.label} :: Width Scale`} description="Scale preview images on the GUI" onSaved={props.onSaved} useTooltip={props.useTooltip} />
        </React.Fragment>
    );
}

type GlobalSettingsFieldsProps = {
    useTooltip?: boolean;
};

const GlobalSettingsFields = (props: GlobalSettingsFieldsProps) => {
    const [resetVersion, setResetVersion] = useState(0);

    const handleReset = () => {
        resetGlobalSettings();
        setResetVersion((v) => v + 1);
    };

    return (
        <React.Fragment key={resetVersion}>
            <DialogButton onClick={handleReset}>Reset Settings</DialogButton>
            <SingleSetting name="api_key" type="text" label="API key" description="Your SteamGridDB API key" useTooltip={props.useTooltip} />
            <SingleSetting name="display_name_fallback" type="bool" label="Search by name fallback" description="Fallback to searching by name if needed" useTooltip={props.useTooltip} />
            <SingleSetting name="replace_custom_images" type="bool" label="Always replace custom Images" description="When replacing all grid images, replace custom set ones as well" useTooltip={props.useTooltip} />
            <SingleSetting name="appids_excluded_from_replacement" type="text" label="Exclude APPIDs from replacement" description="When replacing all grid images, skip these apps (separate by semicolon)" useTooltip={props.useTooltip} />
            <SingleSetting name="prioritize_animated" type="bool" label="Prioritize animated images" description="Prioritize animated images" useTooltip={props.useTooltip} />
            <SingleSetting name="prioritize_authors" type="array" label="Prioritize Authors" description="Prioritize images by author (comma-separated, in order)" useTooltip={props.useTooltip} />
            <SingleSetting name="expand_headers" type="text" label="Expand app header size" description="Set custom header height" useTooltip={props.useTooltip} />
            <SingleSetting name="expand_hero_image" type="bool" label="Expand hero image" description="Make the hero image fill the header width instead of ~1/3 of it (helps on ultrawide/4K monitors)" useTooltip={props.useTooltip} />
            <SingleSetting name="collection_button" type="bool" label="Show SGDB button" description="Show SGDB button for Collections" useTooltip={props.useTooltip} />
            <SingleSetting name="disable_webp" type="bool" label="Disable WEBP support" description="Avoids crashes for some users" useTooltip={props.useTooltip} />
            <SingleSetting name="reapply_app_page" type="bool" label="Reapply on UI modification" description="Fixes header size problem, causes others" useTooltip={props.useTooltip} />
            <SingleSetting name="hide_type_settings" type="bool" label="Hide per-type filter settings" description="Hide the filter settings block above the image grid on each tab" useTooltip={props.useTooltip} />
        </React.Fragment>
    );
};

export const SettingsContent = () => {
    const [gridsReset, resetGrids] = useImageTypeReset(0);
    const [wideGridsReset, resetWideGrids] = useImageTypeReset(3);
    const [heroesReset, resetHeroes] = useImageTypeReset(1);
    const [logosReset, resetLogos] = useImageTypeReset(2);
    const [iconsReset, resetIcons] = useImageTypeReset(4);

    return (
        <div>
            <GlobalSettingsFields/>
            <DialogButton onClick={resetGrids}>Reset Grids Settings</DialogButton>
            <ImageSearchSetting imgType={0} label="Grids" resetVersion={gridsReset} />
            <DialogButton onClick={resetWideGrids}>Reset Wide Grids Settings</DialogButton>
            <ImageSearchSetting imgType={3} label="Wide Grids" resetVersion={wideGridsReset} />
            <DialogButton onClick={resetHeroes}>Reset Heroes Settings</DialogButton>
            <ImageSearchSetting imgType={1} label="Heroes" resetVersion={heroesReset} />
            <DialogButton onClick={resetLogos}>Reset Logos Settings</DialogButton>
            <ImageSearchSetting imgType={2} label="Logos" resetVersion={logosReset} />
            <DialogButton onClick={resetIcons}>Reset Icons Settings</DialogButton>
            <ImageSearchSetting imgType={4} label="Icons" resetVersion={iconsReset} />
        </div>
    );
};

export const GlobalSettingsPage = () => {
    return (
        <div>
            <GlobalSettingsFields useTooltip/>
        </div>
    );
};
