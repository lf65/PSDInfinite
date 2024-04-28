using System.IO;
using PSDInfinite.Editor.Icons;
using UnityEditor.AssetImporters;
using UnityEngine;

namespace PSDInfinite.Editor.Importer
{
    [ScriptedImporter(0, "psdi")]
    public class PSDIImporter : ScriptedImporter
    {
        #region UnityMethods
        public override void OnImportAsset(AssetImportContext ctx)
        {
            TextAsset desc = new TextAsset(File.ReadAllText(ctx.assetPath));
            Texture2D icon = PSDIIcons.Get(PSDIIcons.IconType.PSDIFile);

            ctx.AddObjectToAsset("Interface", desc, icon);
        }
        #endregion
    }
}