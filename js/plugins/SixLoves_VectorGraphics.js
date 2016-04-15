/*jslint nomen:true*/
/*global console*/

/*:
 * @author David Wendt (fantranslation.org)
 * @plugindesc Allows loading of high-res and vector graphics. v0.4.0
 *
 * @param ResolutionTiers
 * @desc Comma-separated list of resolution tiers to search for.
 * @default svg,2.0
 *
 * @help
 *      Enables loading of assets larger than their intended physical size to
 * provide additional graphical detail on higher-resolution screens.
 *
 *      Entirely useless without SixLoves_Responsive installed with resolution
 * independence enabled (EnableResolutionIndependence === "true").
 *
 *      To use this plugin, you must first define a set of high-resolution
 * buckets to search for images in. We support any floating-point number and
 * the special string "svg". These correspond to special mirror img folders at
 * the root of your project. For example, if you set the ResolutionTiers to the
 * following:
 *
 *      1.5, 2.0, svg, 3.0, 4.0
 *
 *      Then this plugin will look for higher-resolution assets in the
 * following folders:
 *
 *      img-1.5  for 1.5x size assets
 *      img-2    for 2.0x size assets
 *      img-svg  for SVG vector assets (renderable at any size)
 *      img-3    for 3.0x size assets
 *      img-4    for 4.0x size assets
 *
 *      These folders should have the asset in the same place as the img folder
 * but with higher detail. Note that these folders are merely additional places
 * to look for assets and the names are suggestions to avoid downloading the
 * wrong asset. You don't have to provide the same asset at every tier either
 * as the system will continue searching for assets until it either runs out
 * of places to find, or it's found an asset with resolution high enough to
 * completely fill the screen with pixels.
 *
 *      The set of tier folders will be searched in the following order:
 *
 *      The special "SVG" tier is always searched first as SVGs can be rendered
 * at any needed size without issue.
 *      Tiers exactly matching the current resolution factor are searched
 * second.
 *      Tiers larger than the current resolution factor are searched from
 * smallest to largest. This gets us the least oversized image possible.
 *      Tiers smaller than the current resolution factor are searched from
 * largest to smallest. This gets us the least undersized image possible.
 *
 *      Please note that the image tier system is merely a suggestion, or a
 * hint as to what resource to load. The system is smart enough to calculate
 * the correct resolution factor for a replacement image. That being said,
 * intentionally lying about your image tiers is not a good idea.
 */

this.SixLoves_VectorGraphics = this.SixLoves_VectorGraphics || {};

(function (root, module) {
    "use strict";

    var ResponsiveVer,
        parameters = root.PluginManager.parameters('SixLoves_VectorGraphics'),
        resolutionTiersString = parameters.ResolutionTiers || "",
        resolutionTiers = resolutionTiersString.split(",");

    if (root.SixLoves_Responsive === undefined ||
            root.SixLoves_Responsive.status !== "loaded") {
        console.err("SixLoves_Responsive not present. HD asset support not installed.");
        module.status = "dependency missing";
        return;
    }

    //Version must be 0.4.0 or any higher patch version
    ResponsiveVer = root.SixLoves_Responsive.version.split(".");
    if (ResponsiveVer[0] !== "0") {
        console.err("SixLoves_Responsive is an incompatible version. Please find an updated one.");
        module.status = "dependency missing";
        return;
    }

    if (ResponsiveVer[1] !== "4") {
        console.err("SixLoves_Responsive is an incompatible version. Please find an updated one.");
        module.status = "dependency missing";
        return;
    }

    if (Number(ResponsiveVer[2]) < 0) {
        console.err("SixLoves_Responsive is an incompatible version. Please find an updated one.");
        module.status = "dependency missing";
        return;
    }

    //Process resolution tiers
    (function () {
        var i;

        for (i = 0; i < resolutionTiers.length; i += 1) {
            resolutionTiers[i] = resolutionTiers[i].trim().toLowerCase();

            if (resolutionTiers[i] !== "svg") {
                resolutionTiers[i] = Number(resolutionTiers[i]);
            }
        }

        //Always check for 1x images, for compatibility.
        if (resolutionTiers.indexOf(1) === -1) {
            resolutionTiers.push(1.0);
        }
    }());

    /* Given a screen resolution, sorts the list of tiers in order of how we
     * should look for them.
     */
    function createTierOrder(resolutionTarget) {
        function sortOrder(x, y) {
            if (x === "svg") {
                return -Infinity;
            }

            if (y === "svg") {
                return Infinity;
            }

            if (x === resolutionTarget) {
                return -1;
            }

            if (y === resolutionTarget) {
                return 1;
            }

            if (x > resolutionTarget) {
                if (y < resolutionTarget) {
                    return -1;
                }

                return x - y;
            }

            if (x < resolutionTarget) {
                if (y > resolutionTarget) {
                    return 1;
                }

                return y - x;
            }
        }

        return resolutionTiers.concat().sort(sortOrder);
    }

    /* Given a list of tiers and a path, construct a set of viable alternates
     * for the bitmap.
     */
    function tiersToAlternates(origPath, tiers) {
        var i, hdpath, outAlternates = [];

        for (i = 0; i < tiers.length; i += 1) {
            if (tiers[i] === "svg") {
                hdpath = origPath.replace(".png", ".svg");
            } else if (tiers[i] === 1) {
                hdpath = origPath;
            } else {
                hdpath = origPath.replace("img\\", "img-" + tiers[i] + "\\");
            }

            outAlternates.push({
                "resolution": (tiers[i] === "svg" ? null : parseFloat(tiers[i])),
                "path": hdpath
            });
        }

        return outAlternates;
    }

    /* Patch ImageManager to generate an alternates list for Bitmap.load.
     */
    root.ImageManager.loadNormalBitmap = function (path, hue) {
        var key = path + ':' + hue, i, hdPath, bitmap,
            apr = root.SixLoves_Responsive.get_artscale_pixel_ratio(),
            sortedTiers = createTierOrder(apr),
            sortedPaths = tiersToAlternates(path, sortedTiers);

        if (!this._cache[key]) {
            bitmap = root.Bitmap.load(path, sortedPaths);

            bitmap.addLoadListener(function () {
                bitmap.rotateHue(hue);
            });
            this._cache[key] = bitmap;
        }
        return this._cache[key];
    };

    /* Patch Bitmap.load to allow multiple "alternate versions" of the same
     * image file.
     *
     * Alternates are possible higher-resolution versions of the same bitmap.
     * The alternates list is a list of objects like so:
     *
     *      {
     *          "resolution": null,
     *          "path": "img/characters/Flowey.svg"
     *      }, {
     *          "resolution": 2.0,
     *          "path": "img-2x/characters/Flowey.png"
     *      }, {
     *          "resolution": 1.0,
     *          "path": "img/characters/Flowey.png"
     *      }
     *
     * Each alternate will be tried and loaded in order. The url parameter is
     * retained as a legacy feature and will be parsed as a single 1.0x
     * alternate.
     *
     * In this mode we also keep track of failures in case another set of
     * alternates are proposed.
     */
    root.Bitmap.load = function (url, alternates) {
        var bitmap = new root.Bitmap();

        bitmap.__SLVG_alternates = alternates;
        bitmap.__SLVG_failures = [];
        bitmap.__SLVG_current = 0;

        bitmap._image = new root.Image();
        bitmap._image.src = bitmap.__SLVG_alternates[bitmap.__SLVG_current].path;
        bitmap._image.onload = root.Bitmap.prototype._onLoad.bind(bitmap);
        bitmap._image.onerror = root.Bitmap.prototype._onError.bind(bitmap);

        //We lie about the URL here.
        bitmap._url = url;
        bitmap._isLoading = true;
        return bitmap;
    };

    /* Patch onLoad so that it knows what to do with an SVG.
     */
    root.Bitmap.prototype._onLoad = function () {
        var targetResolution, sw, sh,
            resolution = this.__SLVG_alternates[this.__SLVG_current].resolution;

        //SVGs always render at the output resolution
        targetResolution = resolution;
        if (targetResolution === null) {
            targetResolution = root.SixLoves_Responsive.get_artscale_pixel_ratio();
            sw = this._image.width;
            sh = this._image.height;
        } else {
            sw = this._image.width / targetResolution;
            sh = this._image.height / targetResolution;
        }

        this._isLoading = false;
        this.resize(sw, sh, targetResolution);
        this._context.drawImage(this._image, 0, 0);
        this._setDirty();
        this._callLoadListeners();
    };

    /* Patch onError so that it knows to try the next alternate before giving
     * up.
     */
    root.Bitmap.prototype._onError = function () {
        if (this.__SLVG_current < (this.__SLVG_alternates.length - 1)) {
            //We still have alternates, so schedule them!
            this.__SLVG_current += 1;

            this._image = new root.Image();
            this._image.src = this.__SLVG_alternates[this.__SLVG_current].path;
            this._image.onload = root.Bitmap.prototype._onLoad.bind(this);
            this._image.onerror = root.Bitmap.prototype._onError.bind(this);
        } else {
            //Give up, we're broken.
            this._hasError = true;
        }
    };

    /* Determine if the bitmap was loaded from an SVG.
     */
    root.Bitmap.prototype.isVector = function () {
        if (bitmap._image === undefined) {
            //SVGs can only be loaded using Bitmap.load
            return false;
        }

        if (bitmap._image.src.indexOf(".svg") !== -1) {
            //SVGs have the letters "svg" in their filename
            return true;
        }

        return false;
    };

    module.status = "loaded";
    module.version = "0.4.0";
}(this, this.SixLoves_VectorGraphics));
