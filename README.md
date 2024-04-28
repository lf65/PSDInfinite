
# PSDInfinite - UI exporter from Adobe Photoshop

Easy export your PSD layers to Files, Unity or Sketch/Figma.

[![GPLv3 License](https://img.shields.io/badge/License-GPL%20v3-yellow.svg)](https://opensource.org/licenses/)


## 🖼️ Preview
<p float="left">
  <img src="https://i.ibb.co/Jzgy2bV/Screenshot-2024-04-28-at-5-24-06-PM.png" width="500" />
</p>

## 💻 Platforms

- Works on Windows & MacOS
- Tested on Adobe Photoshop CC 2019 & Adobe Photoshop 2024
## 🗒️ Instructions

1. [Download](https://github.com/lf65/PSDInfinite/releases/) latest release of PSDInfinite Adobe Photoshop Plugin.
2. Unpack archive in any folder on your PC.
3. Open PSDInfinite script in Adobe Photoshop.
<p float="left">
  <img src="https://i.ibb.co/0B3kYXk/Screenshot-at-Apr-28-5-42-55-PM.png" width="500" />
</p>
<p float="left">
  <img src="https://i.imgur.com/imXNnk3.png"  width="500" />
</p>
4. Select the platform you want to export, set the settings and click "Run".
<br><br>

---
> [!NOTE]
> Layers are exported in the same hierarchy as they are in the layers tab of Adobe Photoshop. Groups are folders, the rest of the elements are individual images in these folders.<br>

> [!WARNING]
> Any SmartObject is rasterized during the export process, which means that everything inside it will be combined into one image.<br>

> [!CAUTION]
> Do not use Cyrillic symbols for the names of layers and groups, this may disrupt the script's operation!

---

### ⚙️ Export to Sketch/Figma

1. Select "Figma & Sketch" tab in PSD Infinite window.
<p float="left">
  <img src="https://i.ibb.co/p2kMWJb/Screenshot-2024-04-28-at-6-21-58-PM.png" width="500" />
</p>
2. Click "Run".<br>
3. Wait until script process will finished.<br>
4. To open file in Figma: go to https://figma.com, login and click "Import" in top right corner of screen. Select exported file (*.sketch) from PSDInfinite Adobe Photoshop Plugin.
<p float="left">
  <img src="https://i.imgur.com/wHcAD90.png" width="500" />
</p>

---

### ⚙️ Export to Unity

1. [Download](https://github.com/lf65/PSDInfinite/releases/) latest release of PSDInfinite Unity Plugin.
2. Select "Unity" tab in PSD Infinite window.
<p float="left">
  <img src="https://i.ibb.co/8zfRFX8/Screenshot-2024-04-28-at-5-57-59-PM.png" width="500" />
</p>
3. Click "Run".<br>
4. Wait until script process will finished.<br>
5. Copy exported folder to your Unity project.
<p float="left">
  <img src="https://i.ibb.co/DRfLBRW/Screenshot-at-Apr-28-6-02-17-PM.png" width="500" />
</p>
6. Select "Interface" file in this folder, and click "Import".
<p float="left">
  <img src="https://i.ibb.co/r0t6RFJ/Screenshot-at-Apr-28-6-05-01-PM.png" width="500" />
</p>
7. In opened PSDInfinite window, you can see preview of layers and groups hierarchy. If you want convert Text layers to TextMeshProUGUI objects, select "Import Text as TMPro Text", and select fonts for each font in file (LiberationSans SDF selected by  default)
<p float="left">
  <img src="https://i.ibb.co/ZgcjZmM/Screenshot-2024-04-28-at-6-06-58-PM.png" width="500" />
</p>
<p float="left">
  <img src="https://i.ibb.co/xjszY3w/Screenshot-2024-04-28-at-6-07-06-PM.png" width="500" />
</p>
8. Click "Generate".<br>
9. An object will appear on the game scene containing your interface.

---

### ⚙️ Export to Files

1. Select "Files" tab in PSD Infinite window.
<p float="left">
  <img src="https://i.ibb.co/Jzgy2bV/Screenshot-2024-04-28-at-5-24-06-PM.png" width="500" />
</p>
2. Click "Run".<br>
3. Wait until script process will finished.