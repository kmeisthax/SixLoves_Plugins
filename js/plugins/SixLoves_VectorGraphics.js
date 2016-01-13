/*jslint nomen:true*/
/*global console*/

/*:
 * @author David Wendt (fantranslation.org)
 * @plugindesc Allows loading of high-res and vector graphics. v0.2.3
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

this.SixLoves_HDAssets = this.SixLoves_HDAssets || {};

(function (root, module) {
    "use strict";

    var ResponsiveVer,
        parameters = root.PluginManager.parameters('SixLoves_VectorGraphics'),
        resolutionTiersString = parameters.ResolutionTiers || "",
        resolutionTiers = resolutionTiersString.split(",");

    if (root.SixLoves_Responsive === undefined ||
        root.SixLoves_Responsive.status !== "loaded") {
        console.err("SixLoves_Responsive not present. HD asset support not installed.");
        module.status = "not loaded";
        return;
    }

    //Version must be 0.2.x where x >= 3
    ResponsiveVer = root.SixLoves_Responsive.version.split(".");
    if (ResponsiveVer[0] !== "0") {
        console.err("SixLoves_Responsive is an incompatible version. Please find an updated one.");
        module.status = "not loaded";
        return;
    }

    if (ResponsiveVer[1] !== "2") {
        console.err("SixLoves_Responsive is an incompatible version. Please find an updated one.");
        module.status = "not loaded";
        return;
    }

    if (Number(ResponsiveVer[2]) < 3) {
        console.err("SixLoves_Responsive is an incompatible version. Please find an updated one.");
        module.status = "not loaded";
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
    }());

    /* Given a screen resolution, sorts the list of tiers in order of how we
     * should look for them.
     */
    function createTierOrder(resolutionTarget) {
        function sortOrder(x,y) {
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

    /* Given a bitmap, find a better quality image and replace the bitmap's
     * image with it.
     *
     * Returns the bitmap. The actual loading happens asynchronously.
     */
    function replaceUntilSatisfied (origPath, hue, bitmap) {
        var i = 0, hdPath = origPath,
            apr = root.SixLoves_Responsive.get_artscale_pixel_ratio(),
            sortedTiers = createTierOrder(apr);

        function replaceAsync() {
            var hdpath = origPath;

            if (i >= sortedTiers.length) {
                //Out of tiers.
                return;
            }

            //Calculate new path
            if (sortedTiers[i] === "svg") {
                hdpath = hdpath.replace(".png", ".svg");
            } else {
                hdpath = hdpath.replace("img", "img-" + sortedTiers[i]);
            }

            ImageManager.replaceBitmap(bitmap, hdpath, hue, apr, function () {
                //succ
            }, function () {
                i += 1;
                replaceAsync();
            });
        }

        replaceAsync();
    }

    /* Patch the ImageManager to support vector graphics loading and deferred
     * rendering.
     */
    root.ImageManager.loadBitmap = function (folder, filename, hue, smooth) {
        if (filename) {
            var path = folder + encodeURIComponent(filename) + '.png';
            var bitmap = this.loadNormalBitmap(path, hue || 0);
            bitmap.smooth = smooth;
            return bitmap;
        } else {
            return this.loadEmptyBitmap();
        }
    };

    root.ImageManager.loadNormalBitmap = function (path, hue) {
        var key = path + ':' + hue;
        if (!this._cache[key]) {
            var bitmap = Bitmap.load(path);
            bitmap.addLoadListener(function() {
                bitmap.rotateHue(hue);
                replaceUntilSatisfied(path, hue, bitmap);
            });
            this._cache[key] = bitmap;
        }
        return this._cache[key];
    };

    /* Replace a bitmap with a suggested higher-resolution version if available
     *
     * This function returns the same bitmap that was passed in. A second
     * image is loaded from the suggested hdpath. If the new image loads
     * successfully, the old one's base texture is quietly replaced with the
     * new version.
     *
     * This function assumes the bitmap had a source _image that was loaded in.
     * Bitmaps not loaded with Bitmap.load are not compatible with this
     * function.
     *
     * hue allows you to tint the bitmap like the loadNormalBitmap function
     * does.
     *
     * targetRes indicates the target pixel ratio you want to render to. It is
     * not a guarantee of what the replaced texture's resolution will be; only
     * what you intended. If your replacement image is a bitmap, the resolution
     * will be calculated by finding the size increase from the original
     * image's size and resolution. If you use a vector image, however, the
     * returned image is guaranteed to be rendered at the target resolution.
     *
     * onsucc and onfail, if provided, are functions called when the replace
     * operation succeeds or fails, respectively. You can use onfail to find
     * another compatible image or onsucc to do something else like force a
     * redraw.
     */
    root.ImageManager.replaceBitmap = function (bitmap, hdpath, hue, targetRes, onsucc, onfail) {
        var img = new Image(),
            isVectorReplacement = hdpath.indexOf(".svg") !== -1,
            oldWidth = bitmap._baseTexture.width,
            oldHeight = bitmap._baseTexture.height,
            oldRes = bitmap._baseTexture.resolution;

        img.src = hdpath;
        img.onerror = onfail;
        img.onload = function () {
            var newResolution = img.width / oldWidth / oldRes;

            console.log(img.width);
            console.log(bitmap.width);
            console.log(bitmap._baseTexture.width);

            console.log(isVectorReplacement);

            if (isVectorReplacement) {
                //SVGs always report width/height in CSS units
                bitmap.resize(img.width, img.height, targetRes);
            } else {
                bitmap.resize(img.width / newResolution, img.height / newResolution, newResolution);
            }

            console.log(img.width);
            console.log(bitmap.width);
            console.log(bitmap._baseTexture.width);

            bitmap._context.drawImage(img, 0, 0, img.width, img.height);
            bitmap._setDirty();

            onsucc(bitmap, img);
        };

        img.onfail = onfail.bind(undefined, bitmap, img);

        return bitmap;
    }

    module.status = "loaded";
    module.version = "0.2.3";
}(this, this.SixLoves_HDAssets));
