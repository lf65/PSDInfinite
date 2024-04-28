using System.IO;
using UnityEditor;
using UnityEngine;

namespace PSDInfinite.Editor.Inspector
{
    [CustomEditor(typeof(TextAsset), true)]
    [CanEditMultipleObjects]
    public class InterfaceFileEditor : UnityEditor.Editor
    {
        #region UnityMethods
        public override void OnInspectorGUI()
        {
            base.OnInspectorGUI();

            bool showImportButton = false;

            foreach (var targetObject in targets)
            {
                var assetPath = AssetDatabase.GetAssetPath(targetObject);
                if (!string.IsNullOrEmpty(assetPath) && Path.GetExtension(assetPath).ToLower() == ".psdi")
                {
                    showImportButton = true;

                    break;
                }
            }

            if (!showImportButton)
                return;

            GUI.enabled = showImportButton;

            float buttonWidth = EditorGUIUtility.currentViewWidth * 0.8f;
            float sidePadding = EditorGUIUtility.currentViewWidth * 0.1f;

            GUILayout.Space(20);
            GUILayout.BeginHorizontal();
            GUILayout.FlexibleSpace();

            if (GUILayout.Button("Import", GUILayout.Width(buttonWidth), GUILayout.Height(30f)))
                PSDInfiniteWizard.OpenWindow();

            GUILayout.FlexibleSpace();
            GUILayout.EndHorizontal();

            GUI.enabled = true;
        }
        #endregion
    }
}