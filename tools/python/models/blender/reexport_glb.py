"""UNTESTED helper: re-import and re-export the generated GLBs with Blender (bpy).

Blender was NOT available when this kit was built, so this script has never
been run. It is not needed by the pipeline: geometry is generated directly as
glTF by ``build_models.py``. It is provided for artists who want to open the
procedural pieces in Blender, tweak them and export them back with the same
names/materials.

Usage (Blender 3.6+/4.x):
    blender --background --python tools/python/models/blender/reexport_glb.py -- \
        apps/web/public/assets/models /tmp/models_reexport

Each <id>.glb is imported into an empty scene and exported to the output
folder as <id>.glb (Y-up, no textures, normals + UVs kept, node names kept).
Keep material names unchanged: the game binds textures by material name.
"""
import os
import sys

import bpy  # type: ignore  # noqa: F401  (only available inside Blender)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    src = argv[0] if argv else "apps/web/public/assets/models"
    dst = argv[1] if len(argv) > 1 else os.path.join(src, "_reexport")
    os.makedirs(dst, exist_ok=True)
    for f in sorted(os.listdir(src)):
        if not f.endswith(".glb"):
            continue
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=os.path.join(src, f))
        bpy.ops.export_scene.gltf(
            filepath=os.path.join(dst, f),
            export_format="GLB",
            export_yup=True,
            export_apply=False,
            export_texcoords=True,
            export_normals=True,
            export_materials="EXPORT",
            export_image_format="NONE",
            export_extras=True,
        )
        print("re-exported", f)


if __name__ == "__main__":
    main()
