using System.Collections.Generic;
using UnityEditor;
using UnityEngine;
using Newtonsoft.Json;
using System.IO;
using UnityEngine.UI;
using System.Linq;
using TMPro;
using UnityEditor.IMGUI.Controls;
using PSDInfinite.Editor.Icons;

public class PSDInfiniteWizard : EditorWindow
{
    #region Constants
    private const string VERSION = "v0.1.0";
    private const string YEAR = "2024";
    private const int WINDOW_DEFAULT_HEIGHT = 350;
    private const int WINDOW_MAX_HEIGHT = 460;
    #endregion

    #region Variables
    private Vector2 _layersScrollPosition;
    private Vector2 _fontsScrollPosition;
    private TreeViewState _layersTreeState;
    private SimpleTreeView _layersTreeView;
    private Dictionary<int, LayerData> _layerTreeIds;
    private Texture2D _selectedLayerImage;

    private static IconsPreset _icons;
    private static Dictionary<string, TMP_FontAsset> _textLayersFonts;
    private static Dictionary<string, LayerData> _textLayersFontsNames;
    private static bool _importTextLikeTMPro = false;
    private static HashSet<string> _createdPaths = new HashSet<string>();
    private static Metadata _metadata;
    private static PSDInfiniteWizard _window;
    #endregion

    #region Menu
    public static void OpenWindow()
    {
        if (!Selection.activeObject || !AssetDatabase.GetAssetPath(Selection.activeObject.GetInstanceID()).Contains(".psdi"))
        {
            EditorUtility.DisplayDialog("PSDInfinite", "Any PSDInfinite Interface file wasn't selected!", "Ok");

            return;
        }

        _textLayersFonts = new Dictionary<string, TMP_FontAsset>();
        _textLayersFontsNames = new Dictionary<string, LayerData>();

        _icons.ArtStation = PSDIIcons.Get(PSDIIcons.IconType.ArtStation);
        _icons.LinkedIn = PSDIIcons.Get(PSDIIcons.IconType.LinkedIn);
        _icons.Telegram = PSDIIcons.Get(PSDIIcons.IconType.Telegram);
        _icons.Upwork = PSDIIcons.Get(PSDIIcons.IconType.Upwork);

        _metadata = JsonConvert.DeserializeObject<Metadata>(File.ReadAllText($"{Application.dataPath.Replace("/Assets", string.Empty)}/{AssetDatabase.GetAssetPath(Selection.activeObject.GetInstanceID())}"));

        for (int i = 0; i < _metadata.layers.Length; i++)
            if (IsLayerType(_metadata.layers[i].type, MetadataLayerType.TEXT) && _metadata.layers[i].textParams != null)
            {
                string font = _metadata.layers[i].textParams.font;

                if (!_textLayersFontsNames.ContainsKey(font))
                {
                    _textLayersFontsNames.Add(font, _metadata.layers[i]);
                    _textLayersFonts.Add(font, null);
                }
            }

        _window = GetWindow<PSDInfiniteWizard>(true, "PSDInfinite", true);
        _window.minSize = _window.maxSize = new Vector2(500, WINDOW_DEFAULT_HEIGHT);

        _window.ShowUtility();
    }
    #endregion

    #region UnityMethods
    private void OnEnable()
    {
        _layersTreeState = new TreeViewState();
        _layerTreeIds = new Dictionary<int, LayerData>();

        _layersTreeView = new SimpleTreeView(_layersTreeState, _layerTreeIds);
        _layersTreeView.OnItemSelectionChanged += OnTreeViewItemSelected;

    }

    private void OnDisable()
    {
        _layersTreeView.OnItemSelectionChanged -= OnTreeViewItemSelected;
    }

    private void OnGUI()
    {
        EditorGUILayout.BeginVertical(GUI.skin.box, GUILayout.ExpandWidth(true), GUILayout.ExpandHeight(true), GUILayout.Height(250));

        EditorGUILayout.LabelField("Layers Preview", EditorStyles.boldLabel);

        _layersScrollPosition = EditorGUILayout.BeginScrollView(_layersScrollPosition);

        EditorGUILayout.BeginHorizontal();

        Rect treeViewRect = GUILayoutUtility.GetRect(200, 200, GUILayout.ExpandHeight(true));

        _layersTreeView.OnGUI(treeViewRect);

        Rect imageRect = GUILayoutUtility.GetRect(100, 100);

        GUI.Box(imageRect, GUIContent.none);

        GUI.DrawTexture(imageRect, _selectedLayerImage, ScaleMode.ScaleToFit);

        EditorGUILayout.EndHorizontal();

        EditorGUILayout.EndScrollView();

        EditorGUILayout.EndVertical();

        GUILayout.Space(5);

        if (_importTextLikeTMPro)
        {
            _window.minSize = _window.maxSize = new Vector2(500, WINDOW_MAX_HEIGHT);

            EditorGUILayout.BeginVertical(GUI.skin.box, GUILayout.ExpandWidth(true), GUILayout.ExpandHeight(true));

            _fontsScrollPosition = EditorGUILayout.BeginScrollView(_fontsScrollPosition, GUILayout.Height(100));

            EditorGUILayout.LabelField("Text Font Settings", EditorStyles.boldLabel);

            foreach (var layer in _textLayersFontsNames)
            {
                EditorGUILayout.BeginHorizontal();

                EditorGUILayout.LabelField(layer.Key, GUILayout.Width(190));

                EditorGUIUtility.wideMode = true;

                _textLayersFonts[layer.Key] = EditorGUILayout.ObjectField(_textLayersFonts[layer.Key], typeof(TMP_FontAsset), false) as TMP_FontAsset;

                EditorGUILayout.EndHorizontal();
            }

            EditorGUILayout.EndScrollView();

            EditorGUILayout.EndVertical();
        }
        else
        {
            _window.minSize = _window.maxSize = new Vector2(500, WINDOW_DEFAULT_HEIGHT);
        }

        GUILayout.Space(5);

        EditorGUILayout.BeginHorizontal(GUILayout.ExpandWidth(true));

        GUILayout.Space(10);

        _importTextLikeTMPro = EditorGUILayout.ToggleLeft("Import Text as TMPro Text", _importTextLikeTMPro);

        GUILayout.FlexibleSpace();

        if (GUILayout.Button("Generate", GUILayout.Width(80), GUILayout.Height(25)))
            Generate();

        GUILayout.Space(10);

        EditorGUILayout.EndHorizontal();

        GUILayout.Space(10);

        EditorGUILayout.BeginHorizontal(GUI.skin.box, GUILayout.ExpandWidth(true), GUILayout.Height(50));

        EditorGUILayout.BeginVertical();

        GUILayout.Space(3);

        GUIStyle grayLabel = new GUIStyle(EditorStyles.label);
        grayLabel.normal.textColor = Color.gray;
        GUILayout.Label($"Elena Filippova\n{VERSION} / {YEAR}", grayLabel, GUILayout.Width(150));

        EditorGUILayout.EndVertical();

        GUILayout.FlexibleSpace();

        EditorGUILayout.BeginVertical();
        GUILayout.Space(3);

        EditorGUILayout.BeginHorizontal();

        GUILayout.Space(3);

        if (GUILayout.Button(_icons.ArtStation, GUIStyle.none, GUILayout.Width(30), GUILayout.Height(30)))
            Application.OpenURL("https://www.artstation.com/lf654");

        GUILayout.Space(3);

        if (GUILayout.Button(_icons.LinkedIn, GUIStyle.none, GUILayout.Width(30), GUILayout.Height(30)))
            Application.OpenURL("https://www.linkedin.com/in/elenafilippova65/");

        GUILayout.Space(3);

        if (GUILayout.Button(_icons.Upwork, GUIStyle.none, GUILayout.Width(30), GUILayout.Height(30)))
            Application.OpenURL("https://upwork.com/freelancers/elenafilippova");

        GUILayout.Space(3);

        if (GUILayout.Button(_icons.Telegram, GUIStyle.none, GUILayout.Width(30), GUILayout.Height(30)))
            Application.OpenURL("https://t.me/lf_65");

        EditorGUILayout.EndHorizontal();
        EditorGUILayout.EndVertical();
        EditorGUILayout.EndHorizontal();
    }
    #endregion

    #region Constructor
    private static void Generate()
    {
        CanvasInfo canvasInfo = CreateCanvas(_metadata.canvas);

        _metadata.layers = _metadata.layers.Reverse().ToArray();

        foreach (var item in _metadata.layers)
            CreateElement(item, canvasInfo);

        _window.Close();
    }

    private static CanvasInfo CreateCanvas(CanvasData canvasData)
    {
        GameObject interfaceRoot = new GameObject("[Interface]");
        GameObject rootWindow = new GameObject("Window");

        Canvas canvas = interfaceRoot.AddComponent<Canvas>();
        canvas.renderMode = RenderMode.ScreenSpaceOverlay;

        interfaceRoot.AddComponent<GraphicRaycaster>();

        CanvasScaler canvasScaler = interfaceRoot.AddComponent<CanvasScaler>();
        canvasScaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        canvasScaler.referenceResolution = new Vector2(canvasData.width, canvasData.height);
        canvasScaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
        canvasScaler.matchWidthOrHeight = 0.5f;

        rootWindow.transform.SetParent(interfaceRoot.transform);

        RectTransform windowRootRect = rootWindow.AddComponent<RectTransform>();
        windowRootRect.anchorMin = Vector2.zero;
        windowRootRect.anchorMax = Vector2.one;
        windowRootRect.anchoredPosition = Vector2.zero;
        windowRootRect.sizeDelta = Vector2.zero;
        windowRootRect.pivot = Vector2.zero;

        return new CanvasInfo() { Canvas = canvas, RootWindow = rootWindow };
    }

    private static void CreateElement(LayerData layerData, CanvasInfo canvasInfo)
    {
        GameObject imageRoot = CreateHierarchyDestination(layerData.hierarchy, canvasInfo);
        GameObject tempObject = new GameObject(layerData.name);
        tempObject.transform.SetParent(imageRoot.transform);
        tempObject.AddComponent<RectTransform>();

        if (_importTextLikeTMPro && IsLayerType(layerData.type, MetadataLayerType.TEXT) && layerData.textParams != null)
        {
            TextMeshProUGUI label = tempObject.AddComponent<TextMeshProUGUI>();
            label.text = layerData.textParams.text;
            label.fontSize = layerData.textParams.size * 1.45f;
            label.enableWordWrapping = false;
            label.alignment = TextAlignmentOptions.MidlineGeoAligned;

            if (_textLayersFonts.ContainsKey(layerData.textParams.font) && _textLayersFonts[layerData.textParams.font])
            {
                label.font = _textLayersFonts[layerData.textParams.font];
                label.UpdateFontAsset();
            }
        }
        else
        {
            string imagePath = $"{AssetDatabase.GetAssetPath(Selection.activeObject.GetInstanceID()).Replace("Interface.psdi", string.Empty)}Content/{layerData.hierarchy}/{layerData.fileName}.png";

            Image image = tempObject.AddComponent<Image>();
            image.sprite = AssetDatabase.LoadAssetAtPath<Sprite>(imagePath);
        }

        RectTransform tempRect = tempObject.GetComponent<RectTransform>();
        tempRect.anchoredPosition = new Vector2(layerData.transformParams.posX, layerData.transformParams.posY);

        tempRect.sizeDelta = new Vector2(layerData.transformParams.width, layerData.transformParams.height);
    }
    #endregion

    #region Tools
    private static GameObject CreateHierarchyDestination(string destination, CanvasInfo canvasInfo)
    {
        if (destination == string.Empty)
            return canvasInfo.RootWindow;

        string[] pathParts = destination.Split('/');

        if (pathParts.Length == 0)
            pathParts = new string[] { destination };

        GameObject contentObject = GetOrCreateObject(canvasInfo.RootWindow.transform, pathParts[0]);
        Transform parentTransform = contentObject.transform;

        for (int i = 1; i < pathParts.Length; i++)
            parentTransform = GetOrCreateObject(parentTransform, pathParts[i]).transform;

        return parentTransform.gameObject;
    }

    private static GameObject GetOrCreateObject(Transform parent, string name)
    {
        foreach (Transform child in parent)
            if (child.name == name)
                return child.gameObject;

        GameObject newObj = new GameObject(name);
        if (parent != null)
            newObj.transform.SetParent(parent);

        RectTransform rectTransform = newObj.AddComponent<RectTransform>();
        rectTransform.anchorMin = Vector2.zero;
        rectTransform.anchorMax = Vector2.one;
        rectTransform.anchoredPosition = Vector2.zero;
        rectTransform.sizeDelta = Vector2.zero;
        rectTransform.pivot = Vector2.zero;

        _createdPaths.Add(GetFullPath(newObj.transform));

        return newObj;
    }

    private static string GetFullPath(Transform transform)
    {
        string path = transform.name;
        while (transform.parent != null)
        {
            transform = transform.parent;
            path = transform.name + "/" + path;
        }
        return path;
    }

    private static bool IsLayerType(string layerType, MetadataLayerType targetType)
    {
        switch (targetType)
        {
            case MetadataLayerType.TEXT:
                {
                    return layerType.ToUpper() == "TEXT";
                }
        }

        return false;
    }
    #endregion

    #region Tree
    class SimpleTreeView : TreeView
    {
        private Dictionary<int, LayerData> idToLayerData;

        public event System.Action<TreeViewItem> OnItemSelectionChanged;

        public SimpleTreeView(TreeViewState treeViewState, Dictionary<int, LayerData> idToLayerData) : base(treeViewState)
        {
            this.idToLayerData = idToLayerData;
            Reload();
        }

        protected override TreeViewItem BuildRoot()
        {
            var root = new TreeViewItem { id = 0, depth = -1, displayName = "Root" };
            Dictionary<string, TreeViewItem> parentNodes = new Dictionary<string, TreeViewItem>();

            foreach (var layerData in _metadata.layers)
            {
                string[] hierarchy = layerData.hierarchy.Split('/');

                TreeViewItem parentNode = root;
                TreeViewItem layerNode = null;
                string imagePath = $"{AssetDatabase.GetAssetPath(Selection.activeObject.GetInstanceID()).Replace("Interface.psdi", string.Empty)}Content/{layerData.hierarchy}/{layerData.fileName}.png";

                if (layerData.hierarchy.Length == 0)
                {
                    layerNode = new TreeViewItem { id = GetUniqueID(), displayName = layerData.name, icon = PSDIIcons.Get(IsLayerType(layerData.type, MetadataLayerType.TEXT) ? PSDIIcons.IconType.Text : PSDIIcons.IconType.Image) };
                    root.AddChild(layerNode);

                    idToLayerData.Add(layerNode.id, new LayerData() { hierarchy = imagePath });

                    continue;
                }

                foreach (string groupName in hierarchy)
                {
                    string fullGroupName = parentNode.displayName + "/" + groupName;

                    if (!parentNodes.TryGetValue(fullGroupName, out TreeViewItem groupNode))
                    {
                        groupNode = new TreeViewItem { id = GetUniqueID(), displayName = groupName, icon = PSDIIcons.Get(PSDIIcons.IconType.Folder) };

                        idToLayerData.Add(groupNode.id, new LayerData() { hierarchy = "" });

                        parentNode.AddChild(groupNode);
                        parentNodes.Add(fullGroupName, groupNode);
                    }

                    parentNode = groupNode;
                }

                layerNode = new TreeViewItem { id = GetUniqueID(), displayName = layerData.name, icon = PSDIIcons.Get(IsLayerType(layerData.type, MetadataLayerType.TEXT) ? PSDIIcons.IconType.Text : PSDIIcons.IconType.Image) };
                parentNode.AddChild(layerNode);

                idToLayerData.Add(layerNode.id, new LayerData() { hierarchy = imagePath });
            }

            SetupDepthsFromParentsAndChildren(root);

            return root;
        }

        protected override void SelectionChanged(IList<int> selectedIds)
        {
            base.SelectionChanged(selectedIds);

            if (selectedIds.Count > 0)
            {
                TreeViewItem selectedItem = FindItem(selectedIds[0], rootItem);
                OnItemSelectionChanged?.Invoke(selectedItem);
            }
        }

        private int GetUniqueID()
        {
            return ++m_NextId;
        }

        private int m_NextId = 0;
    }

    public class LayerDataTreeView : TreeView
    {
        private List<LayerData> layerDataList;

        public LayerDataTreeView(TreeViewState state, MultiColumnHeader multiColumnHeader, List<LayerData> data) : base(state, multiColumnHeader)
        {
            layerDataList = data;

            Reload();
        }

        protected override TreeViewItem BuildRoot()
        {
            var root = new TreeViewItem { id = -1, depth = -1, displayName = "Root" };

            foreach (var layerData in layerDataList)
            {
                var item = new LayerDataTreeViewItem(layerData);
                root.AddChild(item);
            }

            SetupDepthsFromParentsAndChildren(root);
            return root;
        }
    }

    public class LayerDataTreeViewItem : TreeViewItem
    {
        public LayerData layerData;

        public LayerDataTreeViewItem(LayerData data) : base(data.name.GetHashCode(), 0, data.name)
        {
            layerData = data;
        }
    }

    private void OnTreeViewItemSelected(TreeViewItem item)
    {
        if (item != null)
        {
            LayerData layerData;

            if (_layerTreeIds.TryGetValue(item.id, out layerData))
            {
                if (layerData.hierarchy == string.Empty)
                    _selectedLayerImage = PSDIIcons.Get(PSDIIcons.IconType.BigFolder);
                else
                {
                    Texture2D image = AssetDatabase.LoadAssetAtPath<Texture2D>(layerData.hierarchy);
                    if (image != null)
                        _selectedLayerImage = image;
                }
            }
        }
    }
    #endregion

    #region Structs
    public struct CanvasInfo
    {
        public Canvas Canvas;
        public GameObject RootWindow;
    }

    public struct IconsPreset
    {
        public Texture2D ArtStation;
        public Texture2D LinkedIn;
        public Texture2D Telegram;
        public Texture2D Upwork;
    }
    #endregion

    #region Classes
    public class Metadata
    {
        public CanvasData canvas;
        public LayerData[] layers;
        public string version;
    }

    public class CanvasData
    {
        public float width;
        public float height;
    }

    public class LayerData
    {
        public string name;
        public string fileName;
        public string type;
        public string hierarchy;
        public TransformParamsData transformParams;
        public TextParamsData textParams;
    }

    public class TransformParamsData
    {
        public float posX;
        public float posY;
        public float width;
        public float height;
    }

    public class TextParamsData
    {
        public string text;
        public string font;
        public float size;
    }
    #endregion

    #region Enums
    public enum MetadataLayerType
    {
        IMAGE,
        TEXT
    }
    #endregion
}

