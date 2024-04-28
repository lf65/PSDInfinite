#target photoshop
#include "json2.js";
#include "sha1.js";

app.bringToFront();

const VERSION = "v0.1.0";

bootstrap();

function main() {
    prefs = new Object();
    try {
        prefs.filePath = Folder.desktop;
    } catch (e) {
        prefs.filePath = Folder.myDocuments;
    }
    prefs.visibleOnly = true;
    prefs.groupId = 0;
    prefs.format = "PNG-24";
    prefs.fileExtension = ".png";
    prefs.figmaSketchHideText = false;
    prefs.filesHideText = false;
    prefs.filesSavePreview = true;
    prefs.name = activeDocument.name.replace(/\.[^\.]+$/, '');
    prefs.unitySavePreview = true;
    prefs.formatArgs = new ExportOptionsSaveForWeb();
    with(prefs.formatArgs) {
        format = SaveDocumentType.PNG;
        PNG8 = false;
    }

    userCancelled = false;

    var progressBarWindow = createProgressBar();
    if (!progressBarWindow) {
        return "cancel";
    }

    if (showDialog()) {
        var profiler = new Profiler(env.profiling);

        env.documentCopy = activeDocument.duplicate();

        profiler.resetLastTime();

        switch (prefs.targetPlatform) {
            case "Files": {
                if (prefs.filesHideText) {
                    SetTextLayersInvisible();
                }

                break;
            }
            case "Figma & Sketch": {
                if (prefs.figmaSketchHideText) {
                    SetTextLayersInvisible();
                }

                break;
            }
        }

        var layerCountResult = countLayers(progressBarWindow);
        if (userCancelled) {
            return "cancel";
        }
        layerCount = layerCountResult.layerCount;
        visibleLayerCount = layerCountResult.visibleLayerCount;
        var countDuration = profiler.getDuration(true, true);
        if (env.profiling) {
            alert("Layers counted in " + profiler.format(countDuration), "Debug info");
        }

        var collected = collectLayers(progressBarWindow);
        if (userCancelled) {
            alert("Export cancelled! No files saved.", "Finished", false);
            return "cancel";
        }
        layers = collected.layers;
        visibleLayers = collected.visibleLayers;
        groups = collected.groups;
        var collectionDuration = profiler.getDuration(true, true);
        if (env.profiling) {
            alert("Layers collected in " + profiler.format(collectionDuration), "Debug info");
        }

        profiler.resetLastTime();

        var count = exportLayers(prefs.visibleOnly, progressBarWindow);
        var exportDuration = profiler.getDuration(true, true);

        var message = "";
        if (userCancelled) {
            message += "Export cancelled!\n\n";
        }
        message += "Export was successful (" + count.count + " files.)";
        if (env.profiling) {
            message += "\n\nExport function took " + profiler.format(collectionDuration) + " + " + profiler.format(exportDuration) + " to perform.";
        }
        if (count.error) {
            message += "\n\nSome layers failed to export! (Are there many layers with the same name?)"
        }
        alert(message, "Finished", count.error);

        activeDocument.close(SaveOptions.DONOTSAVECHANGES);
        env.documentCopy = null;
    } else {
        return "cancel";
    }
}

function exportLayers(visibleOnly, progressBarWindow) {
    var retVal = {
        count: 0,
        error: false
    };
    var doc = activeDocument;
    var layerCount = layers.length;
    var exportedLayerPaths = new Object();

    if ((layerCount == 1) && layers[0].layer.isBackgroundLayer) {
        if (saveImage(layers[0].layer.name)) {
            ++retVal.count;
        } else {
            retVal.error = true;
        }
    } else {
        var layersToExport = visibleOnly ? visibleLayers : layers;
        const count = layersToExport.length;

        if (progressBarWindow) {
            showProgressBar(progressBarWindow, "Exporting 1 of " + count + "...", count);
        }

        for (var i = 0; i < count; ++i) {
            layersToExport[i].layer.visible = false;
        }

        var countDigits = 0;

        for (var i = 0; i < count; ++i) {
            var layer = layersToExport[i].layer;
            var fileName = makeFileNameFromLayerName(layer);

            if (fileName) {
                makeVisible(layersToExport[i]);

                doc.crop(layer.bounds);

                app.refresh();

                if (layer.kind == LayerKind.SMARTOBJECT)
                    exportSmartObjectLayerToPNG(layer, fileName);
                else
                    saveImage(fileName);

                ++retVal.count;

                undo(doc);

                layer.visible = false;
            } else {
                retVal.error = true;
            }

            if (progressBarWindow) {
                updateProgressBar(progressBarWindow, "Exporting " + (i + 1) + " of " + count + "...");
                repaintProgressBar(progressBarWindow);
                if (userCancelled) {
                    break;
                }
            }
        }

        if (progressBarWindow) {
            progressBarWindow.hide();
        }
    }

    switch (String(prefs.targetPlatform)) {
        case "Files": {
            if (prefs.filesSavePreview)
                SavePreview();

            break;
        }
        case "Unity": {
            if (prefs.unitySavePreview)
                SavePreview();

            var data = {};
            data.canvas = {};
            data.canvas.width = app.activeDocument.width.toString().replace(" px", "");
            data.canvas.height = app.activeDocument.height.toString().replace(" px", "");
            data.layers = [];
            data.version = VERSION;

            for (var i = 0; i < count; ++i) {
                var layer = layersToExport[i].layer;
                var positions = get_layer_bounds(layer);
                var layerHierarchy = getLayerPath(layer, false);

                if (layerHierarchy.length > 0)
                    layerHierarchy = layerHierarchy.substring(0, layerHierarchy.length - 1);

                var layerInfo = {};
                layerInfo.name = layer.name;
                layerInfo.fileName = makeValidFileName(layer.name);
                layerInfo.type = layer.kind.toString().replace("LayerKind.", "");
                layerInfo.hierarchy = layerHierarchy;
                layerInfo.transformParams = {};
                layerInfo.transformParams.posX = positions[0].toString().replace(" px", '');
                layerInfo.transformParams.posY = positions[1].toString().replace(" px", '');
                layerInfo.transformParams.width = positions[2].toString().replace(" px", '');
                layerInfo.transformParams.height = positions[3].toString().replace(" px", '');

                if (layer.kind === LayerKind.TEXT) {
                    var textItem = layer.textItem;
                    var fontSizeString = textItem.size.toString();
                    var fontSizePt = parseFloat(fontSizeString.match(/\d+\.?\d*/)[0]);
                    var dpi = doc.resolution;
                    var fontAspectRatio = 0.75;
                    var fontSizePx = (fontSizePt * dpi) / 72 * fontAspectRatio;

                    layerInfo.textParams = {};
                    layerInfo.textParams.text = textItem.contents;
                    layerInfo.textParams.font = textItem.font;
                    layerInfo.textParams.size = fontSizePx.toFixed(2);
                }

                data.layers.push(layerInfo);
            }

            saveTxt(JSON.stringify(data, null, 4), prefs.filePath + "/" + prefs.name + "/", "Interface");

            break;
        }
        case "Figma & Sketch": {
            SavePreview();
            copySketchTemplate();
            CopyImagesToSketchFolder();
            PrepareSketchPage();
            CreateZip();

            break;
        }
    }

    return retVal;
}

function saveImage(fileName) {
    var desc = new ActionDescriptor(),
        desc2 = new ActionDescriptor();
    desc2.putEnumerated(charIDToTypeID("Op  "), charIDToTypeID("SWOp"), charIDToTypeID("OpSa"));
    desc2.putEnumerated(charIDToTypeID("Fmt "), charIDToTypeID("IRFm"), charIDToTypeID("PN24"));
    desc2.putBoolean(charIDToTypeID("Intr"), false);
    desc2.putBoolean(charIDToTypeID("Trns"), true);
    desc2.putBoolean(charIDToTypeID("Mtt "), true);
    desc2.putBoolean(charIDToTypeID("SHTM"), false);
    desc2.putBoolean(charIDToTypeID("SImg"), true);
    desc2.putBoolean(charIDToTypeID("SSSO"), false);
    desc2.putList(charIDToTypeID("SSLt"), new ActionList());
    desc2.putBoolean(charIDToTypeID("DIDr"), false);
    desc2.putPath(charIDToTypeID("In  "), new File(fileName));
    desc.putObject(charIDToTypeID("Usng"), stringIDToTypeID("SaveForWeb"), desc2);
    executeAction(charIDToTypeID("Expr"), desc, DialogModes.NO);

    return true;
}

function makeFileNameFromLayerName(layer) {
    var ext = prefs.fileExtension;

    createFoldersForLayer(prefs.filePath + "/" + prefs.name + "/Content/" + getLayerPath(layer, false));

    var fileName = prefs.filePath + "/" + prefs.name + "/Content/" + getLayerPath(layer, true);

    return new File(fileName + ext);
}

function collectLayers(progressBarWindow) {
    return collectLayersAM(progressBarWindow);
}

function countLayers(progressBarWindow) {
    return countLayersAM(progressBarWindow);
}

function undo(doc) {
    doc.activeHistoryState = doc.historyStates[doc.historyStates.length - 2];
}

function makeVisible(layer) {
    layer.layer.visible = true;

    var current = layer.parent;
    while (current) {
        if (!current.layer.visible) {
            current.layer.visible = true;
        }
        current = current.parent;
    }
}

function isAdjustmentLayer(layer) {
    switch (layer.kind) {

        case LayerKind.BRIGHTNESSCONTRAST:
        case LayerKind.CHANNELMIXER:
        case LayerKind.COLORBALANCE:
        case LayerKind.CURVES:
        case LayerKind.GRADIENTMAP:
        case LayerKind.HUESATURATION:
        case LayerKind.INVERSION:
        case LayerKind.LEVELS:
        case LayerKind.POSTERIZE:
        case LayerKind.SELECTIVECOLOR:
        case LayerKind.THRESHOLD:
            return true;

        default:
            return false;
    }

}

function createProgressBar() {
    var rsrcFile = new File(env.scriptFileDirectory + "/progress_bar.json");
    var rsrcString = loadResource(rsrcFile);
    if (!rsrcString) {
        return false;
    }

    var win;
    try {
        win = new Window(rsrcString);
    } catch (e) {
        alert("Progress bar resource is corrupt! Please, redownload the script with all files.", "Error", true);
        return false;
    }

    win.barRow.cancelBtn.onClick = function() {
        userCancelled = true;
    };

    win.onClose = function() {
        userCancelled = true;
        return false;
    };

    return win;
}

function showProgressBar(win, message, maxValue) {
    win.lblMessage.text = message;
    win.barRow.bar.maxvalue = maxValue;
    win.barRow.bar.value = 0;

    win.center();
    win.show();
    repaintProgressBar(win, true);
}

function updateProgressBar(win, message) {
    ++win.barRow.bar.value;
    if (message) {
        win.lblMessage.text = message;
    }
}

function repaintProgressBar(win, force) {
    if (env.version >= 11) {
        if (force) {
            app.refresh();
        } else {
            win.update();
        }
    } else {
        var d = new ActionDescriptor();
        d.putEnumerated(app.stringIDToTypeID('state'), app.stringIDToTypeID('state'), app.stringIDToTypeID('redrawComplete'));
        executeAction(app.stringIDToTypeID('wait'), d, DialogModes.NO);
    }
}

function showDialog() {

    // MAINWINDOW
    // ==========
    var MainWindow = new Window("dialog");
    MainWindow.text = "PSD Infinite";
    MainWindow.preferredSize.width = 413;
    MainWindow.orientation = "column";
    MainWindow.alignChildren = ["left", "top"];
    MainWindow.spacing = 5;
    MainWindow.margins = 16;

    // TOP
    // ===
    var Top = MainWindow.add("group", undefined, {
        name: "Top"
    });
    Top.orientation = "row";
    Top.alignChildren = ["left", "center"];
    Top.spacing = 19;
    Top.margins = 0;

    // PATHSETTINGS
    // ============
    var PathSettings = Top.add("group", undefined, {
        name: "PathSettings"
    });
    PathSettings.orientation = "column";
    PathSettings.alignChildren = ["left", "center"];
    PathSettings.spacing = 0;
    PathSettings.margins = 0;

    // NAMEGROUP
    // =========
    var NameGroup = PathSettings.add("group", undefined, {
        name: "NameGroup"
    });
    NameGroup.orientation = "row";
    NameGroup.alignChildren = ["left", "center"];
    NameGroup.spacing = 5;
    NameGroup.margins = 0;

    var NameTitle = NameGroup.add("statictext", undefined, undefined, {
        name: "NameTitle"
    });
    NameTitle.text = "Name:";

    var docName = activeDocument.name.replace(/\.[^\.]+$/, '');
    var NameField = NameGroup.add('edittext {properties: {name: "NameField"}}');
    NameField.text = docName;
    NameField.preferredSize.width = 310;

    // PATHGROUP
    // =========
    var PathGroup = PathSettings.add("group", undefined, {
        name: "PathGroup"
    });
    PathGroup.orientation = "row";
    PathGroup.alignChildren = ["left", "center"];
    PathGroup.spacing =  isWindows() ? 6 : 11;
    PathGroup.margins = 0;
    PathGroup.preferredSize.height = 35;

    var PathTitle = PathGroup.add("statictext", undefined, undefined, {
        name: "PathTitle"
    });
    PathTitle.text = "Path:";
    PathTitle.preferredSize.width = 38;

    // PATHFIELDGROUP
    // ==============
    var PathFieldGroup = PathGroup.add("group", undefined, {
        name: "PathFieldGroup"
    });
    PathFieldGroup.orientation = "row";
    PathFieldGroup.alignChildren = ["left", "center"];
    PathFieldGroup.spacing = 5;
    PathFieldGroup.margins = 0;

    var PathField = PathFieldGroup.add('edittext {properties: {name: "PathField", readonly: true}}');
    PathField.text = prefs.filePath.fsName;
    PathField.preferredSize.width = 266;

    var PathBrowse = PathFieldGroup.add("button", undefined, undefined, {
        name: "PathBrowse"
    });
    PathBrowse.text = "...";
    PathBrowse.preferredSize.width = 40;


    PathBrowse.onClick = function() {
        var newFilePath = Folder.selectDialog("Select destination folder", prefs.filePath);
        if (newFilePath) {
            prefs.filePath = newFilePath;
            PathField.text = newFilePath.fsName;
        }
    }
    // ACTIONS
    // =======
    var Actions = Top.add("group", undefined, {
        name: "Actions"
    });
    Actions.orientation = "column";
    Actions.alignChildren = ["fill", "top"];
    Actions.spacing = 10;
    Actions.margins = 0;

    var Run = Actions.add("button", undefined, undefined, {
        name: "Run"
    });
    Run.text = "Run";
    Run.onClick = function() {
        prefs.targetPlatform = ExportPlatforms.selection.text;
        prefs.name = NameField.text;
        prefs.filesSavePreview = TabFilesSavePreviewToFolder.value;
        prefs.unitySavePreview = TabUnitySavePreviewToFolder.value;

        MainWindow.close(1);
    };

    var Cancel = Actions.add("button", undefined, undefined, {
        name: "Cancel"
    });
    Cancel.text = "Cancel";
    Cancel.onClick = function() {
        MainWindow.close(0);
    };

    // MAINWINDOW
    // ==========
    var ExportTitle = MainWindow.add("statictext", undefined, undefined, {
        name: "ExportTitle"
    });
    ExportTitle.text = "Export To:";

    // EXPORTPLATFORMS
    // ===============
    var ExportPlatforms = MainWindow.add("tabbedpanel", undefined, undefined, {
        name: "ExportPlatforms"
    });
    ExportPlatforms.alignChildren = "fill";
    ExportPlatforms.preferredSize.width = 374;
    ExportPlatforms.margins = 0;
    ExportPlatforms.alignment = ["fill", "top"];

    // TABFILES
    // ========
    var TabFiles = ExportPlatforms.add("tab", undefined, undefined, {
        name: "TabFiles"
    });
    TabFiles.text = "Files";
    TabFiles.orientation = "column";
    TabFiles.alignChildren = ["left", "top"];
    TabFiles.spacing = 10;
    TabFiles.margins = [10,6,0,0];
    TabFiles.onClick = function() {
        prefs.selected = ExportPlatforms.selection.text;
    }
    // TABFILESGROUP_0
    // ===============
    var TabFilesGroup_0 = TabFiles.add("group", undefined, {
        name: "TabFilesGroup_0"
    });
    TabFilesGroup_0.orientation = "column";
    TabFilesGroup_0.alignChildren = ["left", "center"];
    TabFilesGroup_0.spacing = 10;
    TabFilesGroup_0.margins = [0, 4, 0, 0];

    var TabFilesHideAllTextLayers = TabFilesGroup_0.add("checkbox", undefined, undefined, {
        name: "TabFilesHideAllTextLayers"
    });
    TabFilesHideAllTextLayers.text = "Hide All Text Layers";
    TabFilesHideAllTextLayers.onClick = function() {
        prefs.filesHideText = TabFilesHideAllTextLayers.value;
    };

    var TabFilesSavePreviewToFolder = TabFilesGroup_0.add("checkbox", undefined, undefined, {
        name: "TabFilesSavePreviewToFolder"
    });
    TabFilesSavePreviewToFolder.text = "Save Preview To Folder";
    TabFilesSavePreviewToFolder.value = prefs.filesSavePreview;

    // TABFILESINFOPANEL
    // =================
    var TabFilesInfoPanel = TabFiles.add("group", undefined, {
        name: "TabFilesInfoPanel"
    });
    TabFilesInfoPanel.orientation = "row";
    TabFilesInfoPanel.alignChildren = ["left", "center"];
    TabFilesInfoPanel.spacing = 10;
    TabFilesInfoPanel.margins = [0, 15, 0, 10];
    TabFilesInfoPanel.alignment = ["fill", "top"];

    var TabFilesInfoIcon_imgString = "%C2%89PNG%0D%0A%1A%0A%00%00%00%0DIHDR%00%00%00%14%00%00%00%14%08%04%00%00%00'%C2%80%C3%95%C2%86%00%00%00%09pHYs%00%00%0B%13%00%00%0B%13%01%00%C2%9A%C2%9C%18%00%00%06%C2%92iTXtXML%3Acom.adobe.xmp%00%00%00%00%00%3C%3Fxpacket%20begin%3D%22%C3%AF%C2%BB%C2%BF%22%20id%3D%22W5M0MpCehiHzreSzNTczkc9d%22%3F%3E%20%3Cx%3Axmpmeta%20xmlns%3Ax%3D%22adobe%3Ans%3Ameta%2F%22%20x%3Axmptk%3D%22Adobe%20XMP%20Core%209.1-c002%2079.f354efc70%2C%202023%2F11%2F09-12%3A05%3A53%20%20%20%20%20%20%20%20%22%3E%20%3Crdf%3ARDF%20xmlns%3Ardf%3D%22http%3A%2F%2Fwww.w3.org%2F1999%2F02%2F22-rdf-syntax-ns%23%22%3E%20%3Crdf%3ADescription%20rdf%3Aabout%3D%22%22%20xmlns%3Axmp%3D%22http%3A%2F%2Fns.adobe.com%2Fxap%2F1.0%2F%22%20xmlns%3Adc%3D%22http%3A%2F%2Fpurl.org%2Fdc%2Felements%2F1.1%2F%22%20xmlns%3Aphotoshop%3D%22http%3A%2F%2Fns.adobe.com%2Fphotoshop%2F1.0%2F%22%20xmlns%3AxmpMM%3D%22http%3A%2F%2Fns.adobe.com%2Fxap%2F1.0%2Fmm%2F%22%20xmlns%3AstEvt%3D%22http%3A%2F%2Fns.adobe.com%2Fxap%2F1.0%2FsType%2FResourceEvent%23%22%20xmp%3ACreatorTool%3D%22Adobe%20Photoshop%2025.4%20(Macintosh)%22%20xmp%3ACreateDate%3D%222024-04-10T01%3A15%3A13%2B03%3A00%22%20xmp%3AModifyDate%3D%222024-04-10T01%3A16%3A40%2B03%3A00%22%20xmp%3AMetadataDate%3D%222024-04-10T01%3A16%3A40%2B03%3A00%22%20dc%3Aformat%3D%22image%2Fpng%22%20photoshop%3AColorMode%3D%221%22%20xmpMM%3AInstanceID%3D%22xmp.iid%3A630f6d2a-e373-44b3-b589-67643a70e55e%22%20xmpMM%3ADocumentID%3D%22xmp.did%3Acd6eea22-cc76-4278-98a7-5972417efb7d%22%20xmpMM%3AOriginalDocumentID%3D%22xmp.did%3Acd6eea22-cc76-4278-98a7-5972417efb7d%22%3E%20%3CxmpMM%3AHistory%3E%20%3Crdf%3ASeq%3E%20%3Crdf%3Ali%20stEvt%3Aaction%3D%22created%22%20stEvt%3AinstanceID%3D%22xmp.iid%3Acd6eea22-cc76-4278-98a7-5972417efb7d%22%20stEvt%3Awhen%3D%222024-04-10T01%3A15%3A13%2B03%3A00%22%20stEvt%3AsoftwareAgent%3D%22Adobe%20Photoshop%2025.4%20(Macintosh)%22%2F%3E%20%3Crdf%3Ali%20stEvt%3Aaction%3D%22saved%22%20stEvt%3AinstanceID%3D%22xmp.iid%3A40d85ede-efa7-426b-9d72-779dc7c97172%22%20stEvt%3Awhen%3D%222024-04-10T01%3A15%3A51%2B03%3A00%22%20stEvt%3AsoftwareAgent%3D%22Adobe%20Photoshop%2025.4%20(Macintosh)%22%20stEvt%3Achanged%3D%22%2F%22%2F%3E%20%3Crdf%3Ali%20stEvt%3Aaction%3D%22saved%22%20stEvt%3AinstanceID%3D%22xmp.iid%3A630f6d2a-e373-44b3-b589-67643a70e55e%22%20stEvt%3Awhen%3D%222024-04-10T01%3A16%3A40%2B03%3A00%22%20stEvt%3AsoftwareAgent%3D%22Adobe%20Photoshop%2025.4%20(Macintosh)%22%20stEvt%3Achanged%3D%22%2F%22%2F%3E%20%3C%2Frdf%3ASeq%3E%20%3C%2FxmpMM%3AHistory%3E%20%3C%2Frdf%3ADescription%3E%20%3C%2Frdf%3ARDF%3E%20%3C%2Fx%3Axmpmeta%3E%20%3C%3Fxpacket%20end%3D%22r%22%3F%3E5H%06%C3%83%00%00%02%40IDAT(%C2%91M%C2%90%C3%8BK%C2%94a%14%C3%86%7F%C3%A7%7C%C3%9F%C3%8C4%13%C3%AA%C2%94%C3%A5%C2%A2%16JM%C2%90%C2%81b%C3%91%C2%8D%22%C2%92%C2%82(%C2%95%C2%ACUA%C2%85%C3%98V%C2%820ZH%C3%ABZD%10%14-%C3%BA%03%C2%AAMDi%C3%9A%0D%C3%93%C2%8A%C3%92t%C3%A3%25%5BI%C2%B4%C2%B0%0B%05Ny%C3%97%C3%AF%7B%C3%9F%C3%93b%18%C3%A8yV%C3%A7%C3%B2%2C%C2%9E%C2%9F%C2%9C%22b-%C3%A5%2C%02Z%26%C3%87%C3%BCQ%C3%99%2B%C3%B8!%C2%9E%C3%B1%5C%C3%B2%C2%8E%24i%22%04%C2%A5%C2%A8%C2%A4%5C%C3%A7%C2%97%3D%C2%90%16%C3%92%C2%96%C2%96sr_~%C3%89%0DV%15%C3%8Fj%18%20%C2%9B%18%C3%94%C3%8B%0Cs%C2%82%0A*%C2%A9%C2%94%0Ai%C2%96%01%C2%BB%C3%84G%C3%89%09%20%C3%88ibJ%C2%B7%C2%95%7F%C2%8A%22i%C2%B0%5E%03T%C2%BC%19%01%C3%A0%C3%AB%C3%A9%C3%91t%C2%AA%C2%96q%C2%8F%C2%96%C2%B11(%7D%18%C3%BB%60%17%C2%BDF%C2%8C%C3%95%C3%8B%17%C2%BA%C2%AC%22%C3%82%C2%A3%C3%BDnW%14%C2%AD%3C%C2%9AOL%C2%A1%01%5C%C3%97j%C2%8E0%06B%C2%98%C2%90%7B%C2%BEJ%C2%9A%C2%A4%5D%00%C3%B0%13%1C%0Er%C3%91M%C3%90%C2%B0%C2%84v%C3%B7%C2%9E%C3%97%1E%10%C2%82(xa%18%C3%89%C2%81%14!%01%192%C3%AF%5C%7F%C2%AAm%7DV%C2%A3%C3%86%00%C2%B9%06%60%18%1E%3B%2F%C3%BBd%C2%B3%7B%12%C3%A3%C2%88%C2%89Y!%C2%BE%C2%AA%C3%90%1C%C2%A6%C2%9A%C3%8C%C3%89%60%11%11m%C3%9E%C3%B3Aj%5C%C2%8E%C2%97%C2%85(0%C2%AC%C2%B1%1EWv%C3%9Bw%C3%B2EXd%C2%A4M%C2%86x%C2%ACg%15%25(%C3%B8%C2%AF%7C%C2%B5Z5%11%C2%B3bv%C2%89%C2%AB%5C%04%60%C2%9A%C3%BFd%C2%98%C2%A8%0E%C3%9B%06%C3%8Bz%7Cq%C2%BB%C3%A6%C3%BF%07%C2%87%C3%83%C2%95R%C2%A9c%1AwI%C2%A8%7BC%12%14%C2%80%10%00%14%06!%24DvJB%3A5%C3%AC%C3%B6%C3%90%11%C2%A0x%22%0C%C3%89%03%C3%88%C2%AC%60%08%09%12%24%C2%AE8%C2%96%3Auz%C3%86%C3%9D%0A%0E%2C%1E%C2%9C%C3%83%C3%A3%20E%0E%C3%80W%C3%B92%01f%C2%98%C3%9D%C2%9F%3C%C2%B4r%C3%B7%C3%87%C2%B4%C2%9Ca%5D%18%7C%5E%C2%AE%C3%B2%C3%9BS%13%C2%8A%C3%9D%C2%B1%C2%93%2C%60dyC%C2%8B%C3%8C%2FlM%C2%8E%C2%A4%C2%BE%C3%8DV%C3%BF%5C%C2%91V%C2%8Ct%C3%8D%C3%AA%C2%B1hQ%1B%C2%B4%C3%9Fg%C2%9D%C3%AA_%C2%90%C2%8C%C2%85%C2%92%C2%B7%03%3C%0DK%C3%B3u%C2%8B%C2%A3%C2%82%C2%82C%C3%87m%C2%8B%C2%9F%C2%A4%2F%C3%AEsu%C3%8C%C3%A1%C3%8C%C2%B1L%C2%8D%C2%BD%C3%92%C2%B7L%C3%B9j%3Fj(a%C2%A1%C2%A0M%C2%B2%C3%87%C2%AEqA%C3%BB%C2%80I%C2%B0%C2%9C%C3%A0%C3%8D%C3%9D%C2%B6%0E%C2%9D%17%04CZq%C2%94%C2%90%22B%C2%91ri%C3%B4%0D%C2%B2%03%18%C2%B1n%C3%AB%C2%B1%C3%9FJ%C3%80%1F%C2%96P%C3%BE%01%C3%A7%7D%C3%B5%0C%C3%BD%5D%C3%BF%C3%B2%00%00%00%00IEND%C2%AEB%60%C2%82";
    var TabFilesInfoIcon = TabFilesInfoPanel.add("image", undefined, File.decode(TabFilesInfoIcon_imgString), {
        name: "TabFilesInfoIcon"
    });

    var TabFilesInfoText = TabFilesInfoPanel.add("statictext", undefined, undefined, {
        name: "TabFilesInfoText",
        multiline: true
    });
    TabFilesInfoText.text = "Export all visible layers to folders and individual files. Folders are groups, layers are images.";
    TabFilesInfoText.alignment = ["left", "fill"];
    TabFilesInfoText.preferredSize.height = isWindows() ? 28 : 40;
    TabFilesInfoText.preferredSize.width = 400;

    // TABUNITY
    // ========
    var TabUnity = ExportPlatforms.add("tab", undefined, undefined, {
        name: "TabUnity"
    });
    TabUnity.text = "Unity";
    TabUnity.orientation = "column";
    TabUnity.alignChildren = ["left", "top"];
    TabUnity.spacing = 10;
    TabUnity.margins = [10,0,0,0];

    // TABUNITYGROUP_0
    // ===============
    var TabUnityGroup_0 = TabUnity.add("group", undefined, {
        name: "TabUnityGroup_0"
    });
    TabUnityGroup_0.orientation = "column";
    TabUnityGroup_0.alignChildren = ["left", "center"];
    TabUnityGroup_0.spacing = 10;
    TabUnityGroup_0.margins = 0;

    var TabUnityGroup_1 = TabUnityGroup_0.add("group", undefined, {
        name: "TabUnityGroup_1"
    });
    TabUnityGroup_1.orientation = "row";
    TabUnityGroup_1.alignChildren = ["left", "center"];
    TabUnityGroup_1.spacing = 10;
    TabUnityGroup_1.margins = 0;

    var TabUnitySavePreviewToFolder = TabUnityGroup_0.add("checkbox", undefined, undefined, {
        name: "TabUnitySavePreviewToFolder"
    });
    TabUnitySavePreviewToFolder.text = "Save Preview To Folder";
    TabUnitySavePreviewToFolder.value = prefs.unitySavePreview;

    // UNITYINFOPANEL
    // ==============
    var UnityInfoPanel = TabUnity.add("group", undefined, {
        name: "UnityInfoPanel"
    });
    UnityInfoPanel.orientation = "row";
    UnityInfoPanel.alignChildren = ["left", "center"];
    UnityInfoPanel.spacing = 10;
    UnityInfoPanel.margins = [0, 42, 0, 0];
    UnityInfoPanel.alignment = ["fill", "top"];

    var UnityInfoIcon = UnityInfoPanel.add("image", undefined, File.decode(TabFilesInfoIcon_imgString), {
        name: "UnityInfoIcon"
    });

    var UnityInfoText = UnityInfoPanel.add("statictext", undefined, undefined, {
        name: "UnityInfoText",
        multiline: true
    });
    UnityInfoText.text = "Export all visible layers to files and folders for further work in Unity and PSDInfinite Unity plugin.";
    UnityInfoText.alignment = ["left", "fill"];
    UnityInfoText.preferredSize.height = isWindows() ? 28 : 40;
    UnityInfoText.preferredSize.width = 400;

    // TABFIGMASKETCH
    // ==============
    var TabFigmaSketch = ExportPlatforms.add("tab", undefined, undefined, {
        name: "TabFigmaSketch"
    });
    TabFigmaSketch.text = "Figma & Sketch";
    TabFigmaSketch.orientation = "column";
    TabFigmaSketch.alignChildren = ["left", "top"];
    TabFigmaSketch.spacing = 10;
    TabFigmaSketch.margins = [10,6,0,0];

    // EXPORTPLATFORMS
    // ===============
    ExportPlatforms.selection = TabFiles;

    // TABFIGMASKETCHGROUP_0
    // =====================
    var TabFigmaSketchGroup_0 = TabFigmaSketch.add("group", undefined, {
        name: "TabFigmaSketchGroup_0"
    });
    TabFigmaSketchGroup_0.orientation = "row";
    TabFigmaSketchGroup_0.alignChildren = ["left", "center"];
    TabFigmaSketchGroup_0.spacing = 10;
    TabFigmaSketchGroup_0.margins = [0, 4, 0, 0];
    TabFigmaSketchGroup_0.alignment = ["fill", "top"];

    var TabFigmaSketchHideAllTextLayers = TabFigmaSketchGroup_0.add("checkbox", undefined, undefined, {
        name: "TabFigmaSketchHideAllTextLayers"
    });
    TabFigmaSketchHideAllTextLayers.text = "Hide All Text Layers";
    TabFigmaSketchHideAllTextLayers.onClick = function() {
        prefs.figmaSketchHideText = TabFigmaSketchHideAllTextLayers.value;
    };

    // TABFIGMASKETCHINFOPANEL
    // =======================
    var TabFigmaSketchInfoPanel = TabFigmaSketch.add("group", undefined, {
        name: "TabFigmaSketchInfoPanel"
    });
    TabFigmaSketchInfoPanel.orientation = "row";
    TabFigmaSketchInfoPanel.alignChildren = ["left", "center"];
    TabFigmaSketchInfoPanel.spacing = 10;
    TabFigmaSketchInfoPanel.margins = [0, 42, 0, 0];
    TabFigmaSketchInfoPanel.alignment = ["fill", "top"];

    var TabFigmaSketchInfoIcon = TabFigmaSketchInfoPanel.add("image", undefined, File.decode(TabFilesInfoIcon_imgString), {
        name: "TabFigmaSketchInfoIcon"
    });

    var TabFigmaSketchInfoText = TabFigmaSketchInfoPanel.add("group", undefined, {
        name: "TabFigmaSketchInfoText"
    });

    TabFigmaSketchInfoText.orientation = "column";
    TabFigmaSketchInfoText.alignChildren = ["left", "center"];
    TabFigmaSketchInfoText.spacing = 0;

  var TabFigmaSketchInfoTextLabel =  TabFigmaSketchInfoText.add("statictext", undefined, undefined, {
        name: "UnityInfoText",
        multiline: true
    });
    TabFigmaSketchInfoTextLabel.alignment = ["left", "fill"];
    TabFigmaSketchInfoTextLabel.preferredSize.height = isWindows() ? 28 : 40;
    TabFigmaSketchInfoTextLabel.preferredSize.width = 400;
    TabFigmaSketchInfoTextLabel.text = "Export all visible layers to files and folders for further work in Figma or Sketch. Export format: .sketch";

    // AUTHORPANEL
    // ===========
    var mainGroup = MainWindow.add("group");
    mainGroup.orientation = "row";
    mainGroup.alignChildren = "fill";
    mainGroup.margins = [0, 5, 0, 0];

    var textGroup = mainGroup.add("group");
    textGroup.orientation = "column";
    textGroup.alignChildren = "fill";
    textGroup.preferredSize = [280, isWindows() ? 30 : 45];

    var text = textGroup.add("statictext", undefined, undefined, {
        multiline:true
    });
    text.text = "Elena Filippova\r\n2024 / " + VERSION;
    text.preferredSize = [280, isWindows() ? 30 : 45];

    text.multiline = true;

    var buttonGroup = mainGroup.add("group");
    buttonGroup.orientation = "row";
    buttonGroup.alignChildren = "right";

    buttonGroup.orientation = "row";
    buttonGroup.alignChildren = ["right", "center"];
    buttonGroup.spacing = 5;
    buttonGroup.margins = 0;

    createIconButton(buttonGroup, MainWindow, env.scriptFileDirectory + "/images/artstation_icon.png", "ArtStation", "https://www.artstation.com/lf654");
    createIconButton(buttonGroup, MainWindow, env.scriptFileDirectory + "/images/linkedin_icon.png", "LinkedIn", "https://www.linkedin.com/in/elenafilippova65/");
    createIconButton(buttonGroup, MainWindow, env.scriptFileDirectory + "/images/upwork_icon.png", "Upwork", "https://upwork.com/freelancers/elenafilippova");
    createIconButton(buttonGroup, MainWindow, env.scriptFileDirectory + "/images/telegram_icon.png", "Telegram", "https://t.me/lf_65");

    MainWindow.center();

    return MainWindow.show();
}

function openURL(url) {
    try {
        var URL = new File(Folder.temp + "/PSDInfiniteExporterLink.html");
        URL.open("w");
        URL.writeln('<html><HEAD><meta HTTP-EQUIV="REFRESH" content="0; url=' + url + '"></HEAD></HTML>');
        URL.close();
        URL.execute();
    } catch (e) {
        alert("Error, Can Not Open.");
    };
}

function createIconButton(buttonGroup, dlg, iconPath, text, url) {
    var iconFile = File(iconPath);
    var icon;

    if (iconFile.exists) {
        icon = buttonGroup.add("image", undefined, iconFile);
        icon.size = [35, 35];
    } else {
        alert("Файл иконки не найден: " + iconPath);
        return;
    }

    icon.onClick = function() {
        openURL(url);
    };
}

function bootstrap() {
    function showError(err) {
        alert(err + ': on line ' + err.line, 'Script Error', true);
    }

    defineProfilerMethods();

    try {
        var doc = activeDocument;
        if (!doc) {
            throw new Error();
        }
    } catch (e) {
        alert("No document is open! Nothing to export.", "Error", true);
        return "cancel";
    }

    try {
        env = new Object();

        env.profiling = false;

        env.version = parseInt(version, 10);

        if (env.version < 9) {
            alert("Photoshop versions before CS2 are not supported!", "Error", true);
            return "cancel";
        }

        env.cs3OrHigher = (env.version >= 10);

        if (env.cs3OrHigher) {
            env.scriptFileName = $.fileName;
        } else {
            try {
                var illegal = RUNTIME_ERROR;
            } catch (e) {
                env.scriptFileName = e.fileName;
            }
        }

        env.scriptFileDirectory = (new File(env.scriptFileName)).parent;

        if (env.cs3OrHigher) {
            activeDocument.suspendHistory('Export Layers To Files', 'main()');
        } else {
            main();
        }

        if (env.documentCopy) {
            env.documentCopy.close(SaveOptions.DONOTSAVECHANGES);
        }
    } catch (e) {
        if (e.number != 8007) showError(e);
        if (env.documentCopy) {
            env.documentCopy.close(SaveOptions.DONOTSAVECHANGES);
        }
        return "cancel";
    }
}

function collectLayersAM(progressBarWindow) {
    var layers = [],
        visibleLayers = [],
        groups = [];
    var layerCount = 0;

    var ref = null;
    var desc = null;

    const idOrdn = charIDToTypeID("Ordn");

    ref = new ActionReference();
    ref.putEnumerated(charIDToTypeID("Dcmn"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
    desc = executeActionGet(ref);
    layerCount = desc.getInteger(charIDToTypeID("NmbL"));

    if (layerCount == 0) {
        var bg = activeDocument.backgroundLayer;
        var layer = {
            layer: bg,
            parent: null
        };
        layers.push(layer);
        visibleLayers.push(layer);
    } else {
        const idLyr = charIDToTypeID("Lyr ");
        const idLayerSection = stringIDToTypeID("layerSection");
        const idVsbl = charIDToTypeID("Vsbl");
        const idNull = charIDToTypeID("null");
        const idSlct = charIDToTypeID("slct");
        const idMkVs = charIDToTypeID("MkVs");

        const FEW_LAYERS = 10;

        if (layerCount <= FEW_LAYERS) {
            progressBarWindow = null;
        }

        if (progressBarWindow) {
            showProgressBar(progressBarWindow, "Collecting layers... Might take up to several seconds.", (layerCount + FEW_LAYERS) / FEW_LAYERS);
        }

        try {
            var visibleInGroup = [true];
            var layerVisible;
            var currentGroup = null;
            for (var i = layerCount; i >= 1; --i) {
                ref = new ActionReference();
                ref.putIndex(idLyr, i);
                desc = executeActionGet(ref);
                layerVisible = desc.getBoolean(idVsbl);
                layerSection = typeIDToStringID(desc.getEnumerationValue(idLayerSection));
                if ((layerSection == "layerSectionContent") ||
                    (layerSection == "layerSectionStart")) {
                    desc.clear();
                    desc.putReference(idNull, ref);
                    desc.putBoolean(idMkVs, false);
                    executeAction(idSlct, desc, DialogModes.NO);

                    var activeLayer = activeDocument.activeLayer;

                    if (layerSection == "layerSectionContent") {
                        if (!isAdjustmentLayer(activeLayer)) {
                            var layer = {
                                layer: activeLayer,
                                parent: currentGroup
                            };
                            layers.push(layer);
                            if (layerVisible && visibleInGroup[visibleInGroup.length - 1]) {
                                visibleLayers.push(layer);
                            }
                            if (currentGroup) {
                                currentGroup.children.push(layer);
                            }
                        }
                    } else {
                        var group = {
                            layer: activeLayer,
                            parent: currentGroup,
                            children: []
                        };
                        if (group.parent == null) {
                            groups.push(group);
                        } else {
                            group.parent.children.push(group);
                        }
                        currentGroup = group;
                        visibleInGroup.push(layerVisible && visibleInGroup[visibleInGroup.length - 1]);
                    }
                } else if (layerSection == "layerSectionEnd") {
                    currentGroup = currentGroup.parent;
                    visibleInGroup.pop();
                }

                if (progressBarWindow && ((i % FEW_LAYERS == 0) || (i == layerCount))) {
                    updateProgressBar(progressBarWindow);
                    repaintProgressBar(progressBarWindow);
                    if (userCancelled) {
                        throw new Error("cancel");
                    }
                }
            }

            ref = new ActionReference();
            ref.putIndex(idLyr, 0);
            try {
                desc = executeActionGet(ref);
                var bg = activeDocument.backgroundLayer;
                var layer = {
                    layer: bg,
                    parent: null
                };
                layers.push(layer);
                if (bg.visible) {
                    visibleLayers.push(layer);
                }

                if (progressBarWindow) {
                    updateProgressBar(progressBarWindow);
                    repaintProgressBar(progressBarWindow);
                }
            } catch (e) {

            }
        } catch (e) {
            if (e.message != "cancel") throw e;
        }

        if (progressBarWindow) {
            progressBarWindow.hide();
        }
    }

    return {
        layers: layers,
        visibleLayers: visibleLayers,
        groups: groups
    };
}

function countLayersAM(progressBarWindow) {
    var layerCount = 0;
    var preciseLayerCount = 0;
    var visLayerCount = 0;

    var ref = null;
    var desc = null;

    const idOrdn = charIDToTypeID("Ordn");

    ref = new ActionReference();
    ref.putEnumerated(charIDToTypeID("Dcmn"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
    desc = executeActionGet(ref);
    layerCount = desc.getInteger(charIDToTypeID("NmbL"));

    if (layerCount == 0) {
        preciseLayerCount = 1;
        visLayerCount = 1;
    } else {
        const idLyr = charIDToTypeID("Lyr ");
        const idLayerSection = stringIDToTypeID("layerSection");
        const idVsbl = charIDToTypeID("Vsbl");
        const idNull = charIDToTypeID("null");
        const idSlct = charIDToTypeID("slct");
        const idMkVs = charIDToTypeID("MkVs");

        const FEW_LAYERS = 10;

        if (layerCount <= FEW_LAYERS) {
            progressBarWindow = null;
        }

        if (progressBarWindow) {
            showProgressBar(progressBarWindow, "Counting layers... Might take up to several seconds.", (layerCount + FEW_LAYERS) / FEW_LAYERS);
        }

        try {
            var visibleInGroup = [true];
            var layerVisible;
            var layerSection;
            for (var i = layerCount; i >= 1; --i) {
                ref = new ActionReference();
                ref.putIndex(idLyr, i);
                desc = executeActionGet(ref);
                layerVisible = desc.getBoolean(idVsbl);
                layerSection = typeIDToStringID(desc.getEnumerationValue(idLayerSection));
                if (layerSection == "layerSectionContent") {
                    preciseLayerCount++;
                    if (layerVisible && visibleInGroup[visibleInGroup.length - 1]) {
                        visLayerCount++;
                    }
                } else if (layerSection == "layerSectionStart") {
                    visibleInGroup.push(layerVisible && visibleInGroup[visibleInGroup.length - 1]);
                } else if (layerSection == "layerSectionEnd") {
                    visibleInGroup.pop();
                }

                if (progressBarWindow && ((i % FEW_LAYERS == 0) || (i == layerCount))) {
                    updateProgressBar(progressBarWindow);
                    repaintProgressBar(progressBarWindow);
                    if (userCancelled) {
                        throw new Error("cancel");
                    }
                }
            }

            try {
                var bg = activeDocument.backgroundLayer;
                preciseLayerCount++;
                if (bg.visible) {
                    visLayerCount++;
                }

                if (progressBarWindow) {
                    updateProgressBar(progressBarWindow);
                    repaintProgressBar(progressBarWindow);
                }
            } catch (e) {

            }
        } catch (e) {
            if (e.message != "cancel") throw e;
        }

        if (progressBarWindow) {
            progressBarWindow.hide();
        }
    }

    return {
        layerCount: preciseLayerCount,
        visibleLayerCount: visLayerCount
    };
}

function padder(input, padLength) {
    var result = (new Array(padLength + 1 - input.toString().length)).join('0') + input;
    return result;
}

function makeValidFileName(fileName) {
    return fileName.toString().replace(/^\s+|\s+$/gm, '').replace(/[^a-zA-Z0-9]/g, '');
}

function formatString(text) {
    var args = Array.prototype.slice.call(arguments, 1);
    return text.replace(/\{(\d+)\}/g, function(match, number) {
        return (typeof args[number] != 'undefined') ? args[number] : match;
    });
}

function loadResource(file) {
    var rsrcString;
    if (!file.exists) {
        alert("Resource file '" + file.name + "' for the export dialog is missing! Please, download the rest of the files that come with this script.", "Error", true);
        return false;
    }
    try {
        file.open("r");
        if (file.error) throw file.error;
        rsrcString = file.read();
        if (file.error) throw file.error;
        if (!file.close()) {
            throw file.error;
        }
    } catch (error) {
        alert("Failed to read the resource file '" + rsrcFile + "'!\n\nReason: " + error + "\n\nPlease, check it's available for reading and redownload it in case it became corrupted.", "Error", true);
        return false;
    }

    return rsrcString;
}

function Profiler(enabled) {
    this.enabled = enabled;
    if (this.enabled) {
        this.startTime = new Date();
        this.lastTime = this.startTime;
    }
}

function defineProfilerMethods() {
    Profiler.prototype.getDuration = function(rememberAsLastCall, sinceLastCall) {
        if (this.enabled) {
            var currentTime = new Date();
            var lastTime = sinceLastCall ? this.lastTime : this.startTime;
            if (rememberAsLastCall) {
                this.lastTime = currentTime;
            }
            return new Date(currentTime.getTime() - lastTime.getTime());
        }
    }

    Profiler.prototype.resetLastTime = function() {
        this.lastTime = new Date();
    }

    Profiler.prototype.format = function(duration) {
        var output = padder(duration.getUTCHours(), 2) + ":";
        output += padder(duration.getUTCMinutes(), 2) + ":";
        output += padder(duration.getUTCSeconds(), 2) + ".";
        output += padder(duration.getUTCMilliseconds(), 3);
        return output;
    }
}

function get_layer_bounds(layer) {
    switch (String(prefs.targetPlatform)) {
        case "Unity": {
            var doc = app.activeDocument;
            var centerX = Math.round(doc.width.value / 2);
            var centerY = Math.round(doc.height.value / 2);

            var pivotX = Math.round((layer.bounds[0].value + layer.bounds[2].value) / 2);
            var pivotY = Math.round((layer.bounds[1].value + layer.bounds[3].value) / 2);

            var relativeX = pivotX - centerX;
            var relativeY = centerY - pivotY;

            var width = layer.bounds[2].value - layer.bounds[0].value;
            var height = layer.bounds[3].value - layer.bounds[1].value;

            return [relativeX, relativeY, width, height];
        }
        case "Figma & Sketch": {
            var left = layer.bounds[0].value;
            var top = layer.bounds[1].value;

            var width = layer.bounds[2].value - layer.bounds[0].value;
            var height = layer.bounds[3].value - layer.bounds[1].value;

            return [left, top, width, height];
        }
    }

    var doc = app.activeDocument;
    var pivotX = (layer.bounds[0].value + layer.bounds[2].value) / 2;
    var pivotY = (layer.bounds[1].value + layer.bounds[3].value) / 2;
    var relativeX = Math.round(pivotX);
    var relativeY = Math.round(doc.height.value - pivotY);
    var width = layer.bounds[2].value - layer.bounds[0].value;
    var height = layer.bounds[3].value - layer.bounds[1].value;

    return [relativeX, relativeY, width, height];
}

function saveTxt(txt, Path, Name) {
    var saveFile = File(Path + "/" + Name + ".psdi");

    if (saveFile.exists)
        saveFile.remove();

    saveFile.encoding = "UTF8";
    saveFile.open("e", "TEXT", "????");
    saveFile.writeln(txt);
    saveFile.close();
}

function exportSmartObjectLayerToPNG(smartObjectLayer, path) {
    activeDocument.activeLayer = smartObjectLayer;
    app.runMenuItem(stringIDToTypeID('placedLayerEditContents'));

    var activeDoc = app.activeDocument;

    var layerHeight = activeDoc.height.as("px");
    var layerWidth = activeDoc.width.as("px");

    var psdFile = new File(path + ".psd");
    activeDoc.saveAs(psdFile, new PhotoshopSaveOptions(), true, Extension.LOWERCASE);

    activeDoc.close(SaveOptions.DONOTSAVECHANGES);

    var tempDoc = app.open(psdFile);

    var exportOptions = new ExportOptionsSaveForWeb();
    exportOptions.format = SaveDocumentType.PNG;
    exportOptions.PNG8 = false;
    exportOptions.transparency = true;

    var pngFile = new File(path);
    tempDoc.exportDocument(pngFile, ExportType.SAVEFORWEB, exportOptions);

    tempDoc.close(SaveOptions.DONOTSAVECHANGES);

    psdFile.remove();
}

function getLayerPath(layer, withLayerName) {
    var path = withLayerName ? makeValidFileName(layer.name) : "";

    while (layer.parent != null && layer.parent.typename != "Document") {
        layer = layer.parent;
        path = layer.name + "/" + path;
    }

    return path;
}

function createFoldersForLayer(path) {
    var folders = path.split("/");
    var currentFolder = new Folder(path);
    currentFolder.create();

    for (var i = 0; i < folders.length; i++) {
        var folderName = folders[i];
        var newPath = currentFolder + "/" + folderName;
        currentFolder = new Folder(newPath);
        currentFolder.create();
    }
}

function copySketchTemplate() {
    var docName = activeDocument.name.replace(".psd", "");
    var sourceFolder = Folder(env.scriptFileDirectory + "/templates/sketch/");
    var destinationFolder = Folder(prefs.filePath + "/" + docName + "/");

    if (sourceFolder.exists) {
        if (!destinationFolder.exists)
            destinationFolder.create();

        copyFilesAndFolders(sourceFolder, destinationFolder);
    }
}

function copyFilesAndFolders(source, destination) {
    var files = source.getFiles();
    for (var i = 0; i < files.length; i++) {
        var file = files[i];
        if (file instanceof File) {
            var newFile = new File(destination + "/" + file.name);
            file.copy(newFile);
        } else if (file instanceof Folder) {
            var newDestination = new Folder(destination + "/" + file.name);
            if (!newDestination.exists) {
                newDestination.create();
            }
            copyFilesAndFolders(file, newDestination);
        }
    }
}

function removeFolder(folder) {
    var files = folder.getFiles();
    for (var i = 0; i < files.length; i++) {
        if (files[i] instanceof Folder) {
            removeFolder(files[i]);
        } else {
            files[i].remove();
        }
    }
    folder.remove();
}

function isWindows(){
    return $.os.indexOf("Windows") !== -1;
}
function CreateZip(folderPath) {
    var docName = activeDocument.name.replace(".psd", "");
    var rootFolder = new Folder(prefs.filePath + "/" + docName + "/").parent;
    var sourcePath = docName;
    var destFileName = prefs.name + '.zip';
    var destPath = rootFolder + "/" + destFileName;
    var shellString = "";

    if (isWindows()) {
        destPath = rootFolder.fsName + "\\" + destFileName;

        var zipperPath = new File(env.scriptFileDirectory).fsName;
        var destFolder = new Folder(prefs.filePath + "/" + docName + "/");

        shellString = "cd " + destFolder.fsName + "\\ && " + zipperPath + "\\zip.exe -r ";
        shellString += "\"" + destPath + "\"";
        shellString += " ";
        shellString += "\"" + "*" + "\""
    } else {
        shellString = "cd " + rootFolder.toString().replace(/ /g, "\\ ") + " && ditto -ck --sequesterRsrc ";
        shellString += sourcePath.replace(/ /g, "\\ ");
        shellString += " ";
        shellString += destFileName.replace(/ /g, "\\ ");
    }

    var x = undefined;
    var sh = app.system(shellString);
    !sh ? x = true : x = false;

    if (x) {
        var zipFile = new File(destPath);
        while (!zipFile.exists) {
            $.sleep(100);
        }

        var newFileName = destPath.replace(".zip", ".sketch");
        var newFile = new File(newFileName);
        zipFile.copy(newFile);

        zipFile.remove();

        var sourceFolder = new Folder(rootFolder + "/" + sourcePath);

        removeFolder(sourceFolder);

        switch (String(prefs.targetPlatform)) {
            case "Figma & Sketch": {
                removeFolder(new Folder(prefs.filePath + "/" + prefs.name + "/"))

                break;
            }
        }
    }

    return x;
}

function CopyImagesToSketchFolder() {
    var docName = activeDocument.name.replace(".psd", "");
    var sourceFolder = new Folder(prefs.filePath + "/" + prefs.name + "/Content/");
    var destinationFolder = new Folder(prefs.filePath + "/" + docName + "/images/");

    if (sourceFolder != null && destinationFolder != null) {
        copyFiles(sourceFolder, destinationFolder, "");
    }

    var sourceFile = new File(prefs.filePath + "/" + prefs.name + "/Preview.png");
    destinationFolder = new Folder(prefs.filePath + "/" + docName + "/previews/");

    var destinationFile = new File(destinationFolder + "/preview.png");

    sourceFile.copy(destinationFile);
}

function copyFiles(source, destination, prefix) {
    prefix = typeof prefix !== 'undefined' ? prefix : "";

    var fileList = source.getFiles();

    for (var i = 0; i < fileList.length; i++) {
        if (fileList[i] instanceof File) {
            var fileName = prefix;
            if (prefix !== "" && prefix.charAt(prefix.length - 1) !== "_") {
                fileName += "_";
            }
            fileName += fileList[i].name;
            fileName = prepareLayerName(fileName);

            fileName = hex_sha1(fileName);

            var newFile = new File(destination + "/" + fileName + ".png");
            fileList[i].copy(newFile);
        } else if (fileList[i] instanceof Folder) {
            var folderName = fileList[i].name;

            folderName = decodeURIComponent(folderName).replace(/[^\w\d_]/g, '');

            copyFiles(fileList[i], destination, prefix === "" ? folderName : prefix + "_" + folderName);
        }
    }
}

function makeJsonFromLayersToSketch(doc) {
    var json = {
        "_class": "page",
        "do_objectID": "2FFDFB58-88DB-4181-AF9D-0992465502E8",
        "booleanOperation": -1,
        "isFixedToViewport": false,
        "isFlippedHorizontal": false,
        "isFlippedVertical": false,
        "isLocked": false,
        "isTemplate": false,
        "isVisible": true,
        "layerListExpandedType": 1,
        "name": "Page 1",
        "nameIsFixed": false,
        "resizingConstraint": 63,
        "resizingType": 0,
        "rotation": 0,
        "shouldBreakMaskChain": false,
        "exportOptions": {
            "_class": "exportOptions",
            "includedLayerIds": [],
            "layerOptions": 0,
            "shouldTrim": false,
            "exportFormats": []
        },
        "frame": {
            "_class": "rect",
            "constrainProportions": true,
            "height": 0,
            "width": 0,
            "x": 0,
            "y": 0
        },
        "clippingMaskMode": 0,
        "hasClippingMask": false,
        "style": {
            "_class": "style",
            "do_objectID": "47778040-5F05-4867-9505-D55B7D62A677",
            "endMarkerType": 0,
            "miterLimit": 10,
            "startMarkerType": 0,
            "windingRule": 1,
            "blur": {
                "_class": "blur",
                "isEnabled": false,
                "center": "{0.5, 0.5}",
                "motionAngle": 0,
                "radius": 10,
                "saturation": 1,
                "type": 0
            },
            "borderOptions": {
                "_class": "borderOptions",
                "isEnabled": true,
                "dashPattern": [],
                "lineCapStyle": 0,
                "lineJoinStyle": 0
            },
            "borders": [],
            "colorControls": {
                "_class": "colorControls",
                "isEnabled": false,
                "brightness": 0,
                "contrast": 1,
                "hue": 0,
                "saturation": 1
            },
            "contextSettings": {
                "_class": "graphicsContextSettings",
                "blendMode": 0,
                "opacity": 1
            },
            "fills": [],
            "innerShadows": [],
            "shadows": []
        },
        "hasClickThrough": true,
        "groupLayout": {
            "_class": "MSImmutableFreeformGroupLayout"
        },
        "layers": [],
        "horizontalRulerData": {
            "_class": "rulerData",
            "base": 0,
            "guides": []
        },
        "verticalRulerData": {
            "_class": "rulerData",
            "base": 0,
            "guides": []
        }
    };

    function processLayers(layers, jsonLayers) {
        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];

            if (!layer.visible)
                continue;

            if (layer.typename === "LayerSet") {
                var group = {
                    "_class": "group",
                    "do_objectID": generateUUID(),
                    "booleanOperation": -1,
                    "isFixedToViewport": false,
                    "isFlippedHorizontal": false,
                    "isFlippedVertical": false,
                    "isLocked": false,
                    "isTemplate": false,
                    "isVisible": true,
                    "layerListExpandedType": 1,
                    "name": layer.name,
                    "nameIsFixed": true,
                    "resizingConstraint": 63,
                    "resizingType": 0,
                    "rotation": 0,
                    "shouldBreakMaskChain": false,
                    "exportOptions": {
                        "_class": "exportOptions",
                        "includedLayerIds": [],
                        "layerOptions": 0,
                        "shouldTrim": false,
                        "exportFormats": []
                    },
                    "frame": {
                        "_class": "rect",
                        "constrainProportions": false,
                        "height": app.activeDocument.height.toString().replace(" px", ""),
                        "width": app.activeDocument.width.toString().replace(" px", ""),
                        "x": 0,
                        "y": 0
                    },
                    "clippingMaskMode": 0,
                    "hasClippingMask": false,
                    "style": {
                        "_class": "style",
                        "do_objectID": "536A7E4E-7B44-439A-B809-804BEBBD7360",
                        "endMarkerType": 0,
                        "miterLimit": 10,
                        "startMarkerType": 0,
                        "windingRule": 1,
                        "blur": {
                            "_class": "blur",
                            "isEnabled": false,
                            "center": "{0.5, 0.5}",
                            "motionAngle": 0,
                            "radius": 10,
                            "saturation": 1,
                            "type": 0
                        },
                        "borderOptions": {
                            "_class": "borderOptions",
                            "isEnabled": true,
                            "dashPattern": [],
                            "lineCapStyle": 0,
                            "lineJoinStyle": 0
                        },
                        "borders": [],
                        "colorControls": {
                            "_class": "colorControls",
                            "isEnabled": false,
                            "brightness": 0,
                            "contrast": 1,
                            "hue": 0,
                            "saturation": 1
                        },
                        "contextSettings": {
                            "_class": "graphicsContextSettings",
                            "blendMode": 0,
                            "opacity": 1
                        },
                        "fills": [],
                        "innerShadows": [],
                        "shadows": []
                    },
                    "hasClickThrough": false,
                    "groupLayout": {
                        "_class": "MSImmutableFreeformGroupLayout"
                    },
                    "layers": []
                };
                jsonLayers.push(group);

                processLayers(layer.layers, group.layers);
            } else {
                var layerName = prepareLayerName(getFileNameFromLayerHierarchy(layer) + ".png");
                var imagePath = "images/" + hex_sha1(layerName);
                var imageBounds = get_layer_bounds(layer);
                var posX = imageBounds[0].toString().replace(" px", '');
                var posY = imageBounds[1].toString().replace(" px", '');
                var width = imageBounds[2].toString().replace(" px", '');
                var height = imageBounds[3].toString().replace(" px", '');

                var layerData = {
                    "_class": "bitmap",
                    "do_objectID": generateUUID(),
                    "booleanOperation": -1,
                    "isFixedToViewport": false,
                    "isFlippedHorizontal": false,
                    "isFlippedVertical": false,
                    "isLocked": false,
                    "isTemplate": false,
                    "isVisible": layer.visible,
                    "layerListExpandedType": 1,
                    "name": layer.name,
                    "nameIsFixed": false,
                    "resizingConstraint": 63,
                    "resizingType": 0,
                    "shouldBreakMaskChain": false,
                    "exportOptions": {
                        "_class": "exportOptions",
                        "includedLayerIds": [],
                        "layerOptions": 0,
                        "shouldTrim": false,
                        "exportFormats": []
                    },
                    "frame": {
                        "_class": "rect",
                        "constrainProportions": true,
                        "height": height,
                        "width": width,
                        "x": posX,
                        "y": posY
                    },
                    "clippingMaskMode": 0,
                    "hasClippingMask": false,
                    "style": {
                        "_class": "style",
                        "do_objectID": "50D88ED8-289F-4B2B-B89B-24565441AD8F",
                        "endMarkerType": 0,
                        "miterLimit": 10,
                        "startMarkerType": 0,
                        "windingRule": 1,
                        "blur": {
                            "_class": "blur",
                            "isEnabled": false,
                            "center": "{0.5, 0.5}",
                            "motionAngle": 0,
                            "radius": 10,
                            "saturation": 1,
                            "type": 0
                        },
                        "borderOptions": {
                            "_class": "borderOptions",
                            "isEnabled": true,
                            "dashPattern": [],
                            "lineCapStyle": 0,
                            "lineJoinStyle": 0
                        },
                        "borders": [],
                        "colorControls": {
                            "_class": "colorControls",
                            "isEnabled": false,
                            "brightness": 0,
                            "contrast": 1,
                            "hue": 0,
                            "saturation": 1
                        },
                        "contextSettings": {
                            "_class": "graphicsContextSettings",
                            "blendMode": 0,
                            "opacity": 1
                        },
                        "fills": [],
                        "innerShadows": [],
                        "shadows": []
                    },
                    "clippingMask": "{{0, 0}, {1, 1}}",
                    "fillReplacesImage": false,
                    "image": {
                        "_class": "MSJSONFileReference",
                        "_ref_class": "MSImageData",
                        "_ref": imagePath
                    },
                    "intendedDPI": 72
                };
                jsonLayers.push(layerData);
            }
        }
    }

    processLayers(doc.layers, json.layers);

    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0,
                v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16).toUpperCase();
        });
    }

    function reverseLayers(layers) {
        layers.reverse();
        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            if (layer.layers) {
                reverseLayers(layer.layers);
            }
        }
    }

    reverseLayers(json.layers);

    return JSON.stringify(json, null, 4);
}

function prepareLayerName(name) {
    return decodeURIComponent(name).replace(/[^\w\d_]/g, '');
}

function getFileNameFromLayerHierarchy(layer) {
    var fileName = layer.name;
    var parent = layer.parent;
    while (parent && parent.typename !== "Document") {
        fileName = parent.name + "_" + fileName;
        parent = parent.parent;
    }

    return fileName;
}

function PrepareSketchPage() {
    var docName = activeDocument.name.replace(".psd", "");
    var filePath = prefs.filePath + "/" + docName + "/pages/2FFDFB58-88DB-4181-AF9D-0992465502E8.json";

    var pageFile = new File(filePath);
    pageFile.open("w");
    pageFile.write(makeJsonFromLayersToSketch(app.activeDocument));
    pageFile.close();
}

function isPathExistsInTree(tree, path) {
    var folders = path.split('/');
    var currentNode = tree;

    for (var i = 0; i < folders.length; i++) {
        var folderName = folders[i];

        if (!currentNode[folderName]) {
            return false;
        }

        currentNode = currentNode[folderName];
    }

    return true;
}

function makeAllLayersVisible(layers) {
    for (var i = 0; i < layers.length; i++) {
        var layer = layers[i];
        var canSetVisible = true;

        if (layer.kind === LayerKind.TEXT) {
            switch (prefs.targetPlatform) {
                case "Files": {
                    if (prefs.filesHideText) {
                        canSetVisible = false;
                    }

                    break;
                }
                case "Figma & Sketch": {
                    if (prefs.figmaSketchHideText) {
                        canSetVisible = false;
                    }

                    break;
                }
            }
        }

        layer.visible = canSetVisible;
        if (layer.typename == "LayerSet") {
            makeAllLayersVisible(layer.layers);
        }
    }
}

function SavePreview() {
    var doc = app.activeDocument;

    makeAllLayersVisible(doc.layers);

    var options = new ExportOptionsSaveForWeb();
    options.format = SaveDocumentType.PNG;
    options.PNG8 = false;
    options.quality = 100;

    doc.exportDocument(new File(prefs.filePath + "/" + prefs.name + "/Preview.png"), ExportType.SAVEFORWEB, options);
}

function SetTextLayersInvisible() {
    function processLayers(layer) {
        if (layer.kind == LayerKind.TEXT) {
            layer.visible = false;
        } else if (layer.typename == "LayerSet") {
            for (var i = 0; i < layer.layers.length; i++) {
                processLayers(layer.layers[i]);
            }
        } else if (layer.kind == LayerKind.SMARTOBJECT) {
            app.activeDocument.activeLayer = layer;
            app.executeAction(stringIDToTypeID("placedLayerEditContents"), undefined, DialogModes.NO);

            var smartDoc = app.activeDocument;

            for (var j = 0; j < smartDoc.layers.length; j++) {
                processLayers(smartDoc.layers[j]);
            }

            smartDoc.close(SaveOptions.SAVECHANGES);
        }
    }

    function processMainDocument() {
        var doc = app.activeDocument;

        for (var i = 0; i < doc.layers.length; i++) {
            var layer = doc.layers[i];

            if (layer.kind == LayerKind.SMARTOBJECT) {
                app.activeDocument = doc;
                doc.activeLayer = layer;
                app.executeAction(stringIDToTypeID("placedLayerEditContents"), undefined, DialogModes.NO);

                var smartDoc = app.activeDocument;
                for (var j = 0; j < smartDoc.layers.length; j++) {
                    processLayers(smartDoc.layers[j]);
                }

                smartDoc.close(SaveOptions.SAVECHANGES);
            } else {
                processLayers(layer);
            }
        }
    }

    if (app.documents.length > 0) {
        processMainDocument();
    } else {
        alert("Document not opened!");
    }
}