/*jslint nomen:true*/
/*global console*/

/*:
 * @author David Wendt (fantranslation.org)
 * @plugindesc Contains RPG Maker core patches to support SixLoves_Responsive.
 * @help
 *
 *      This plugin replaces a number of core update functions to support the
 * rather disruptive changes that can happen with SixLoves_Responsive. It does
 * not make an attempt at retaining the functionality of whatever code already
 * exists. If you run this plugin after another plugin that alters core code,
 * it won't be reflected in the patched versions this plugin provides. As a
 * result, you should run this plugin early, before any other code that may
 * change update functions. Ideally, that other code should also be altered to
 * support the features of SixLoves_Responsive (e.g. .layout and frame-adaptive
 * .update)
 */

this.SixLoves_Responsive_MVCore = this.SixLoves_Responsive_MVCore || {};

(function (root, module) {
    "use strict";

    var force_frame_adaptive, layout_all;

    if (root.SixLoves_Responsive === undefined) {
        console.err("SixLoves_Responsive not present. Cannot load core patches.");
        module.status = "not loaded";
        return;
    }

    force_frame_adaptive = root.SixLoves_Responsive.force_frame_adaptive;
    layout_all = root.SixLoves_Responsive.layout_all;

    /* == GENERIC IMPLEMENTATIONS == */

    /* Adjust Scene_Base.update to allow frame_adaptive logic.
     */
    root.Scene_Base.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        //Note that the way this works allows the first update function to
        //control the second function's frame count. Thus, if the first
        //function isn't frame-adaptive, the second function will get a rounded
        //off frame count, and the adjustment in frame time will propagate back
        //up.

        //Note that I have yet to find a way to deal with the SECOND update
        //function doing this. This would eventually mean update functions
        //drifting out-of-sync with each other...
        frameCount = force_frame_adaptive(frameCount, this.updateFade, this);
        frameCount = force_frame_adaptive(frameCount, this.updateChildren, this);

        root.AudioManager.checkErrors();

        return frameCount;
    };

    root.Scene_Base.prototype.update.frame_adaptive = true;

    /* Adaptive version of scene transition fades.
     *
     * Note how we clamp the actual frame count to how long the fade's supposed
     * to last. This ensures we don't over-shoot if we get a ridiculously high
     * frameCount (which can happen in practice, browsers WILL ramp down an
     * animation to ridiculously low framerates or even stop them altogether if
     * the document context they're on is inactive).
     */
    root.Scene_Base.prototype.updateFade = function (frameCount) {
        var maxFadeFrames, d;

        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this._fadeDuration > 0) {
            d = this._fadeDuration;

            maxFadeFrames = Math.min(d, frameCount);

            if (this._fadeSign > 0) {
                this._fadeSprite.opacity -= this._fadeSprite.opacity / d * maxFadeFrames;
            } else {
                this._fadeSprite.opacity += (255 - this._fadeSprite.opacity) / d * maxFadeFrames;
            }

            this._fadeDuration -= maxFadeFrames;
        }

        return frameCount;
    };

    root.Scene_Base.prototype.updateFade.frame_adaptive = true;

    /* Traversal of child update functions, updated to ensure adaptive-ness can
     * pass to eligible children.
     */
    root.Scene_Base.prototype.updateChildren = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        this.children.forEach(function (child) {
            if (child.update) {
                frameCount = force_frame_adaptive(frameCount, child.update, child);
            }
        });

        return frameCount;
    };

    root.Scene_Base.prototype.updateChildren.frame_adaptive = true;

    /* Add the layout method to the Scene implementation.
     */
    root.Scene_Base.prototype.layout = function () {
        var width = root.Graphics.boxWidth,
            height = root.Graphics.boxHeight,
            x = (root.Graphics.width - width) / 2,
            y = (root.Graphics.height - height) / 2;

        if (!this._windowLayer) {
            return this.createWindowLayer();
        }

        this._windowLayer.move(x, y, width, height);
        this.width = width;
        this.height = height;

        layout_all(this.children);
    };

    /* Add the layout method to the WindowLayer implementation.
     *
     * Triggering layout on a WindowLayer just lays out all children.
     */
    root.WindowLayer.prototype.layout = function () {
        layout_all(this.children);
    };

    root.WindowLayer.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        this.children.forEach(function (child) {
            if (child.update) {
                frameCount = force_frame_adaptive(frameCount, child.update, child);
            }
        });

        return frameCount;
    };

    root.WindowLayer.prototype.update.frame_adaptive = true;
    
    /* For some reason, WindowLayer renders everything to a second canvas if we
     * use the Canvas2D APIs. This need to be patched to support .resolution as
     * of v0.2.0
     */
    root.WindowLayer.prototype._renderCanvas = function (renderSession) {
        if (!this.visible) {
            return;
        }

        if (!this._tempCanvas) {
            this._tempCanvas = document.createElement('canvas');
        }

        this._tempCanvas.width = root.Graphics.width * renderSession.resolution;
        this._tempCanvas.height = root.Graphics.height * renderSession.resolution;

        var i, j, child, realCanvasContext = renderSession.context,
            context = this._tempCanvas.getContext('2d');

        context.save();
        context.clearRect(0, 0, root.Graphics.width * renderSession.resolution, root.Graphics.height * renderSession.resolution);
        context.beginPath();
        context.rect(this.x, this.y, this.width * renderSession.resolution, this.height * renderSession.resolution);
        context.closePath();
        context.clip();

        renderSession.context = context;

        for (i = 0; i < this.children.length; i += 1) {
            child = this.children[i];
            if (child._isWindow && child.visible && child.openness > 0) {
                this._canvasClearWindowRect(renderSession, child);
                context.save();
                child._renderCanvas(renderSession);
                context.restore();
            }
        }

        context.restore();

        renderSession.context = realCanvasContext;
        renderSession.context.setTransform(1, 0, 0, 1, 0, 0);
        renderSession.context.globalCompositeOperation = 'source-over';
        renderSession.context.globalAlpha = 1;
        renderSession.context.drawImage(this._tempCanvas, 0, 0);

        for (j = 0; j < this.children.length; j += 1) {
            if (!this.children[j]._isWindow) {
                this.children[j]._renderCanvas(renderSession);
            }
        }
    };
    
    /* Same for sprites, too.
     */
    root.Sprite.prototype.layout = function () {
        layout_all(this.children);
    };

    /* Also we need to update sprites adaptively, too.
     */
    root.Sprite.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        this.children.forEach(function (child) {
            if (child.update) {
                frameCount = force_frame_adaptive(frameCount, child.update, child);
            }
        });

        return frameCount;
    };

    root.Sprite.prototype.update.frame_adaptive = true;

    root.TilingSprite.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        this.children.forEach(function (child) {
            if (child.update) {
                frameCount = force_frame_adaptive(frameCount, child.update, child);
            }
        });

        return frameCount;
    };

    root.TilingSprite.prototype.update.frame_adaptive = true;

    root.Tilemap.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        this.animationCount += frameCount;

        this.children.forEach(function (child) {
            if (child.update) {
                frameCount = force_frame_adaptive(frameCount, child.update, child);
            }
        });

        return frameCount;
    };

    root.Tilemap.prototype.update.frame_adaptive = true;

    /* This function patches _createLayers to create high-resolution cache
     * surfaces for the Tilemap. It's a little different; however; we round up
     * the pixel ratio now to avoid getting gaps where a fractional-ratio
     * surface would get cut up and rounded in different directions.
     */
    root.Tilemap.prototype._createLayers = function () {
        var i, pixel_ratio = Math.ceil(root.SixLoves_Responsive.get_artscale_pixel_ratio()),
            width = this._width,
            height = this._height,
            margin = this._margin,
            tileCols = Math.ceil(width / this._tileWidth) + 1,
            tileRows = Math.ceil(height / this._tileHeight) + 1,
            layerWidth = tileCols * this._tileWidth,
            layerHeight = tileRows * this._tileHeight;

        this._lowerBitmap = new root.Bitmap(layerWidth, layerHeight, pixel_ratio);
        this._upperBitmap = new root.Bitmap(layerWidth, layerHeight, pixel_ratio);
        this._layerWidth = layerWidth;
        this._layerHeight = layerHeight;

        /*
         * Z coordinate:
         *
         * 0 : Lower tiles
         * 1 : Lower characters
         * 3 : Normal characters
         * 4 : Upper tiles
         * 5 : Upper characters
         * 6 : Airship shadow
         * 7 : Balloon
         * 8 : Animation
         * 9 : Destination
         */

        this._lowerLayer = new root.Sprite();
        this._lowerLayer.move(-margin, -margin, width, height);
        this._lowerLayer.z = 0;

        this._upperLayer = new root.Sprite();
        this._upperLayer.move(-margin, -margin, width, height);
        this._upperLayer.z = 4;

        for (i = 0; i < 4; i += 1) {
            this._lowerLayer.addChild(new root.Sprite(this._lowerBitmap));
            this._upperLayer.addChild(new root.Sprite(this._upperBitmap));
        }

        this.addChild(this._lowerLayer);
        this.addChild(this._upperLayer);
    };

    /* More adaptive update code for sprites.
     */
    root.Sprite_Base.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Sprite.prototype.update, this);
        frameCount = force_frame_adaptive(frameCount, this.updateVisibility, this);
        frameCount = force_frame_adaptive(frameCount, this.updateAnimationSprites, this);

        return frameCount;
    };

    root.Sprite_Base.prototype.update.frame_adaptive = true;

    /* Sprite_Base update code that doesn't need to adapt to framerate. */
    root.Sprite_Base.prototype.updateVisibility.frame_adaptive = true;
    root.Sprite_Base.prototype.updateAnimationSprites.frame_adaptive = true;

    /* Animated sprites, too.
     */
    root.Sprite_Animation.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Sprite.prototype.update, this);
        frameCount = force_frame_adaptive(frameCount, this.updateMain, this);
        frameCount = force_frame_adaptive(frameCount, this.updateFlash, this);
        frameCount = force_frame_adaptive(frameCount, this.updateScreenFlash, this);
        frameCount = force_frame_adaptive(frameCount, this.updateHiding, this);
        root.Sprite_Animation._checker1 = {};
        root.Sprite_Animation._checker2 = {};

        return frameCount;
    };

    root.Sprite_Animation.prototype.updateFlash = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this._flashDuration > 0) {
            var d = this._flashDuration;
            this._flashDuration = Math.max(this._flashDuration - frameCount, 0);

            this._flashColor[3] *= (d - frameCount) / d;
            this._target.setBlendColor(this._flashColor);
        }

        return frameCount;
    };

    root.Sprite_Animation.prototype.updateFlash.frame_adaptive = true;

    root.Sprite_Animation.prototype.updateScreenFlash = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this._screenFlashDuration > 0) {
            var d = this._screenFlashDuration;
            this._screenFlashDuration = Math.max(this._screenFlashDuration - frameCount, 0);

            if (this._screenFlashSprite) {
                this._screenFlashSprite.x = -this.absoluteX();
                this._screenFlashSprite.y = -this.absoluteY();
                this._screenFlashSprite.opacity *= (d - frameCount) / d;
                this._screenFlashSprite.visible = (this._screenFlashDuration > 0);
            }
        }

        return frameCount;
    };

    root.Sprite_Animation.prototype.updateScreenFlash.frame_adaptive = true;

    root.Sprite_Animation.prototype.updateHiding = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this._hidingDuration > 0) {
            this._hidingDuration = Math.max(this._hidingDuration - frameCount, 0);
            if (this._hidingDuration === 0) {
                this._target.show();
            }
        }

        return frameCount;
    };

    root.Sprite_Animation.prototype.updateHiding.frame_adaptive = true;

    root.Sprite_Animation.prototype.updateMain = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this.isPlaying() && this.isReady()) {
            if (this._delay > 0) {
                this._delay = Math.max(this._delay - frameCount, 0);
            } else {
                this._duration = Math.max(this._duration - frameCount, 0);

                this.updatePosition();
                if (this._duration % this._rate === 0) {
                    this.updateFrame(); //TODO: Determine if this has anything that needs to be changed
                }
            }
        }

        return frameCount;
    };

    root.Sprite_Animation.prototype.updateMain.frame_adaptive = true;

    /* Traverse child update functions, and scale the animation count correctly
     */
    root.Window.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this.active) {
            this._animationCount += frameCount;
        }

        this.children.forEach(function (child) {
            if (child.update) {
                frameCount = force_frame_adaptive(frameCount, child.update, child);
            }
        });

        return frameCount;
    };

    root.Window.prototype.update.frame_adaptive = true;

    /* Traverse child update functions, and our own stuff, too.
     */
    root.Window_Base.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Window.prototype.update, this);
        frameCount = force_frame_adaptive(frameCount, this.updateTone, this);
        frameCount = force_frame_adaptive(frameCount, this.updateOpen, this);
        frameCount = force_frame_adaptive(frameCount, this.updateClose, this);
        frameCount = force_frame_adaptive(frameCount, this.updateBackgroundDimmer, this);

        return frameCount;
    };

    root.Window_Base.prototype.update.frame_adaptive = true;

    /* Make the window opening animation frame-adaptive.
     */
    root.Window_Base.prototype.updateOpen = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this._opening) {
            this.openness += 32 * frameCount;
            if (this.isOpen()) {
                this._opening = false;
            }
        }

        return frameCount;
    };

    root.Window_Base.prototype.updateOpen.frame_adaptive = true;

    /* Make the window closing animation frame-adaptive.
     */
    root.Window_Base.prototype.updateClose = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this._closing) {
            this.openness -= 32 * frameCount;
            if (this.isClosed()) {
                this._closing = false;
            }
        }

        return frameCount;
    };

    root.Window_Base.prototype.updateClose.frame_adaptive = true;

    /* Here's some other functions that aren't frame-scalable at all.
     */
    root.Window_Base.prototype.updateTone.frame_adaptive = true;
    root.Window_Base.prototype.updateBackgroundDimmer.frame_adaptive = true;

    /* Window_Base actually does pixel-level sampling of the window skin graphic
     * which means we have to manually highres this shit
     */
    root.Window_Base.prototype.textColor = function (n) {
        var px = 96 + (n % 8) * 12 + 6,
            py = 144 + Math.floor(n / 8) * 12 + 6;
        return this.windowskin.getPixel(Math.floor(px * this.windowskin._baseTexture.resolution),
                                        Math.floor(py * this.windowskin._baseTexture.resolution));
    };

    /* Update Window_Selectable with frame-adaptive code.
     */
    root.Window_Selectable.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Window_Base.prototype.update, this);
        frameCount = force_frame_adaptive(frameCount, this.updateArrows, this);
        frameCount = force_frame_adaptive(frameCount, this.processCursorMove, this);
        frameCount = force_frame_adaptive(frameCount, this.processHandling, this);
        frameCount = force_frame_adaptive(frameCount, this.processWheel, this);
        frameCount = force_frame_adaptive(frameCount, this.processTouch, this);
        this._stayCount += frameCount;

        return frameCount;
    };

    root.Window_Selectable.prototype.update.frame_adaptive = true;

    /* Update functions for Window_Selectable that don't need to be redone
     */
    root.Window_Selectable.prototype.updateArrows.frame_adaptive = true;
    root.Window_Selectable.prototype.processCursorMove.frame_adaptive = true;
    root.Window_Selectable.prototype.processHandling.frame_adaptive = true;
    root.Window_Selectable.prototype.processWheel.frame_adaptive = true;
    root.Window_Selectable.prototype.processTouch.frame_adaptive = true;

    /* Add the layout method to the Window implementation.
     *
     * This method relies on the existence of methods which comprise the way
     * that Window layout is usually done for non-fixed windows:
     *
     *  - windowWidth: Returns the desired width of the window.
     *  - windowHeight: Returns the desired height of the window.
     *  - updatePlacement: Sets the window position.
     *
     * If your Window class lays itself out differently, but is not laid out by
     * the parent scene, please override .layout with an appropriate
     * implementation.
     */
    root.Window.prototype.layout = function () {
        if (this.windowWidth && this.windowHeight) {
            this.width = this.windowWidth();
            this.height = this.windowHeight();
        }

        if (this.updatePlacement) {
            this.updatePlacement();
        }

        layout_all(this.children);
    };

    /* Ensure screen-filling sprites actually, y'know, fill the screen.
     */
    root.ScreenSprite.prototype.layout = function () {
        this.scale.x = root.Graphics.width;
        this.scale.y = root.Graphics.height;

        layout_all(this.children);
    };

    /* == SPECIAL-PURPOSE IMPLEMENTATIONS: TITLE SCREEN == */

    /* Ensure that Scene_Title's override does not break other adaptive code.
     */
    root.Scene_Title.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (!this.isBusy()) {
            this._commandWindow.open();
        }
        frameCount = force_frame_adaptive(frameCount, root.Scene_Base.prototype.update, this);

        return frameCount;
    };

    root.Scene_Title.prototype.update.frame_adaptive = true;

    /* Recenter the background when a layout is triggered.
     */
    root.Scene_Title.prototype.layout = function () {
        this.centerSprite(this._backSprite1);
        this.centerSprite(this._backSprite2);

        this.removeChild(this._gameTitleSprite);
        this.createForeground();

        root.Scene_Base.prototype.layout.call(this);
    };

    root.Scene_Title.prototype.centerSprite = (function (old_impl) {
        return function (sprite) {
            var fillingScale;

            //Awful hack because I can't figure out how to get Sprite/Bitmap to spit out
            //their unscaled sizes
            if (sprite.SCENE_TITLE__firstW === undefined) {
                sprite.SCENE_TITLE__firstW = sprite.bitmap.width;
            }

            if (sprite.SCENE_TITLE__firstH === undefined) {
                sprite.SCENE_TITLE__firstH = sprite.bitmap.height;
            }

            fillingScale = Math.max(root.Graphics.width / sprite.SCENE_TITLE__firstW,
                                    root.Graphics.height / sprite.SCENE_TITLE__firstH);

            sprite.scale.x = fillingScale;
            sprite.scale.y = fillingScale;

            old_impl(sprite);
        };
    }(root.Scene_Title.prototype.centerSprite));

    /* == SPECIAL-PURPOSE IMPLEMENTATIONS: MENU SCREEN == */

    /* Reposition the Gold window when needed
     */
    root.Scene_Menu.prototype.layout = function () {
        if (this._goldWindow !== undefined) {
            this._goldWindow.y = root.Graphics.boxHeight - this._goldWindow.height;
        }

        root.Scene_MenuBase.prototype.layout.call(this);
    };

    /* == SPECIAL-PURPOSE IMPLEMENTATIONS: MAP SCREEN == */

    /* Adjust the map code to be frame-adaptive.
     */
    root.Scene_Map.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, this.updateDestination, this);
        frameCount = force_frame_adaptive(frameCount, this.updateMainMultiply, this);

        if (this.isSceneChangeOk()) {
            frameCount = force_frame_adaptive(frameCount, this.updateScene, this);
        } else if (root.SceneManager.isNextScene(root.Scene_Battle)) {
            frameCount = force_frame_adaptive(frameCount, this.updateEncounterEffect, this);
        }

        force_frame_adaptive(frameCount, this.updateWaitCount, this);
        frameCount = force_frame_adaptive(frameCount, root.Scene_Base.prototype.update, this);

        return frameCount;
    };

    root.Scene_Map.prototype.update.frame_adaptive = true;

    /* This function doesn't actually do anything that needs to be changed, we
     * just need to keep it from being called repeatedly.
     */
    root.Scene_Map.prototype.updateDestination.frame_adaptive = true;

    /* Oh look how cute apparantly some core code does the same trick we do
     *
     * This core code doubles the update speed of the scene when the run button
     * is held. Since we actually have a facility for scaling frame time now,
     * let's just double that...
     */
    root.Scene_Map.prototype.updateMainMultiply = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this.isFastForward()) {
            frameCount *= 2;
        }

        frameCount = force_frame_adaptive(frameCount, this.updateMain, this);

        //We also have to slow time back down so other functions are unaffected
        if (this.isFastForward()) {
            frameCount /= 2;
        }

        return frameCount;
    };

    root.Scene_Map.prototype.updateMainMultiply.frame_adaptive = true;

    /* Adjust the map code to be frame-adaptive.
     */
    root.Scene_Map.prototype.updateMain = function (frameCount) {
        var active = this.isActive(),
            $gMu = root.$gameMap.update.bind(root.$gameMap, [active]),
            $gPu = root.$gamePlayer.update.bind(root.$gamePlayer, [active]),
            $gTu = root.$gameTimer.update.bind(root.$gameTimer, [active]);

        if (frameCount === undefined) {
            frameCount = 1;
        }

        //Preserve the frame_adaptive flag when we curry arguments.
        $gMu.frame_adaptive = root.$gameMap.update.frame_adaptive;
        $gPu.frame_adaptive = root.$gamePlayer.update.frame_adaptive;
        $gTu.frame_adaptive = root.$gameTimer.update.frame_adaptive;

        frameCount = force_frame_adaptive(frameCount, $gMu, root.$gameMap);
        frameCount = force_frame_adaptive(frameCount, $gPu, root.$gamePlayer);
        frameCount = force_frame_adaptive(frameCount, $gTu, root.$gameTimer);
        frameCount = force_frame_adaptive(frameCount, root.$gameScreen.update, root.$gameScreen);

        return frameCount;
    };

    root.Scene_Map.prototype.updateMain.frame_adaptive = true;

    root.Scene_Map.prototype.updateScene.frame_adaptive = true;

    root.Scene_Map.prototype.updateWaitCount = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this._waitCount > 0) {
            this._waitCount = Math.max(this._waitCount - frameCount, 0);
            return true;
        }
        return false;
    };

    root.Scene_Map.prototype.updateWaitCount.frame_adaptive = true;

    /* The actual Game_Map object needs to be patched, too. */
    root.Game_Map.prototype.update = function (sceneActive, frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        this.refreshIfNeeded();
        if (sceneActive) {
            this.updateInterpreter();
        }
        frameCount = force_frame_adaptive(frameCount, this.updateScroll, this);
        frameCount = force_frame_adaptive(frameCount, this.updateEvents, this);
        frameCount = force_frame_adaptive(frameCount, this.updateVehicles, this);
        frameCount = force_frame_adaptive(frameCount, this.updateParallax, this);

        return frameCount;
    };

    root.Game_Map.prototype.update.frame_adaptive = true;

    /* SCREEN SCROLLING AT TOTALBISCUIT-COMPLIANT FRAMERATES WOO
     */
    root.Game_Map.prototype.updateScroll = function (frameCount) {
        var scrollAmount, lastX, lastY;

        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this.isScrolling()) {
            lastX = this._displayX;
            lastY = this._displayY;

            //Prevents an extremely long frame update from overscrolling
            scrollAmount = Math.min(this.scrollDistance() * frameCount, this._scrollRest);
            this.doScroll(this._scrollDirection, scrollAmount);

            if (this._displayX === lastX && this._displayY === lastY) {
                this._scrollRest = 0;
            } else {
                this._scrollRest -= scrollAmount;
            }
        }

        return frameCount;
    };

    root.Game_Map.prototype.updateScroll.frame_adaptive = true;

    root.Game_Map.prototype.updateEvents = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        this.events().forEach(function (event) {
            frameCount = force_frame_adaptive(frameCount, event.update, event);
        });
        this._commonEvents.forEach(function (event) {
            frameCount = force_frame_adaptive(frameCount, event.update, event);
        });

        return frameCount;
    };

    root.Game_Map.prototype.updateEvents.frame_adaptive = true;

    root.Game_Map.prototype.updateVehicles = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        this._vehicles.forEach(function (vehicle) {
            frameCount = force_frame_adaptive(frameCount, vehicle.update, vehicle);
        });

        return frameCount;
    };

    root.Game_Map.prototype.updateVehicles.frame_adaptive = true;

    root.Game_Map.prototype.updateParallax = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this._parallaxLoopX) {
            this._parallaxX += this._parallaxSx / this.tileWidth() / 2 * frameCount;
        }
        if (this._parallaxLoopY) {
            this._parallaxY += this._parallaxSy / this.tileHeight() / 2 * frameCount;
        }

        return frameCount;
    };

    root.Game_Map.prototype.updateParallax.frame_adaptive = true;

    /* Common event codes. Fairly sure this is map specific. */
    root.Game_CommonEvent.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this._interpreter) {
            if (!this._interpreter.isRunning()) {
                this._interpreter.setup(this.list());
            }
            frameCount = force_frame_adaptive(frameCount, this._interpreter.update, this._interpreter);
        }

        return frameCount;
    };

    root.Game_CommonEvent.prototype.update.frame_adaptive = true;

    root.Game_CharacterBase.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this.isStopping()) {
            frameCount = force_frame_adaptive(frameCount, this.updateStop, this);
        }
        if (this.isJumping()) {
            frameCount = force_frame_adaptive(frameCount, this.updateJump, this);
        } else if (this.isMoving()) {
            frameCount = force_frame_adaptive(frameCount, this.updateMove, this);
        }
        frameCount = force_frame_adaptive(frameCount, this.updateAnimation, this);

        return frameCount;
    };

    root.Game_CharacterBase.prototype.update.frame_adaptive = true;

    root.Game_CharacterBase.prototype.updateStop = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        this._stopCount += frameCount;

        return frameCount;
    };

    root.Game_CharacterBase.prototype.updateStop.frame_adaptive = true;

    root.Game_CharacterBase.prototype.updateJump = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        this._jumpCount = Math.max(this._jumpCount - frameCount, 0);
        this._realX = (this._realX * this._jumpCount + this._x) / (this._jumpCount + 1.0);
        this._realY = (this._realY * this._jumpCount + this._y) / (this._jumpCount + 1.0);
        this.refreshBushDepth();
        if (this._jumpCount === 0) {
            this._realX = this._x = root.$gameMap.roundX(this._x);
            this._realY = this._y = root.$gameMap.roundY(this._y);
        }

        return frameCount;
    };

    root.Game_CharacterBase.prototype.updateJump.frame_adaptive = true;

    root.Game_CharacterBase.prototype.updateMove = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this._x < this._realX) {
            this._realX = Math.max(this._realX - this.distancePerFrame() * frameCount, this._x);
        }
        if (this._x > this._realX) {
            this._realX = Math.min(this._realX + this.distancePerFrame() * frameCount, this._x);
        }
        if (this._y < this._realY) {
            this._realY = Math.max(this._realY - this.distancePerFrame() * frameCount, this._y);
        }
        if (this._y > this._realY) {
            this._realY = Math.min(this._realY + this.distancePerFrame() * frameCount, this._y);
        }
        if (!this.isMoving()) {
            this.refreshBushDepth();
        }

        return frameCount;
    };

    root.Game_CharacterBase.prototype.updateMove.frame_adaptive = true;

    root.Game_CharacterBase.prototype.updateAnimation = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, this.updateAnimationCount, this);
        if (this._animationCount >= this.animationWait()) {
            frameCount = force_frame_adaptive(frameCount, this.updatePattern, this);
            this._animationCount = 0;
        }

        return frameCount;
    };

    root.Game_CharacterBase.prototype.updateAnimation.frame_adaptive = true;

    root.Game_CharacterBase.prototype.updateAnimationCount = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this.isMoving() && this.hasWalkAnime()) {
            this._animationCount += 1.5 * frameCount;
        } else if (this.hasStepAnime() || !this.isOriginalPattern()) {
            this._animationCount += frameCount;
        }

        return frameCount;
    };

    root.Game_CharacterBase.prototype.updateAnimationCount.frame_adaptive = true;

    root.Game_CharacterBase.prototype.updatePattern = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (!this.hasStepAnime() && this._stopCount > 0) {
            this.resetPattern();
        } else {
            this._pattern = (this._pattern + 1) % this.maxPattern();
        }

        return frameCount;
    };

    root.Game_CharacterBase.prototype.updatePattern.frame_adaptive = true;

    root.Game_Character.prototype.updateStop = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Game_CharacterBase.prototype.updateStop, this);
        if (this._moveRouteForcing) {
            frameCount = force_frame_adaptive(frameCount, this.updateRoutineMove, this);
        }

        return frameCount;
    };

    root.Game_Character.prototype.updateStop.frame_adaptive = true;

    root.Game_Character.prototype.updateRoutineMove = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this._waitCount > 0) {
            this._waitCount = Math.max(this._waitCount - frameCount, 0);
        } else {
            this.setMovementSuccess(true);
            var command = this._moveRoute.list[this._moveRouteIndex];
            if (command) {
                this.processMoveCommand(command);
                this.advanceMoveRouteIndex();
            }
        }

        return frameCount;
    };

    root.Game_Character.prototype.updateRoutineMove.frame_adaptive = true;

    root.Game_Player.prototype.update = function (sceneActive, frameCount) {
        var lastScrolledX = this.scrolledX(),
            lastScrolledY = this.scrolledY(),
            wasMoving = this.isMoving();

        if (frameCount === undefined) {
            frameCount = 1;
        }

        this.updateDashing();
        if (sceneActive) {
            this.moveByInput();
        }
        frameCount = force_frame_adaptive(frameCount, root.Game_Character.prototype.update, this);
        this.updateScroll(lastScrolledX, lastScrolledY);
        this.updateVehicle();
        if (!this.isMoving()) {
            this.updateNonmoving(wasMoving);
        }
        frameCount = force_frame_adaptive(frameCount, this._followers.update, this._followers);

        return frameCount;
    };

    root.Game_Player.prototype.update.frame_adaptive = true;

    root.Game_Event.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Game_Character.prototype.update, this);
        this.checkEventTriggerAuto();
        frameCount = force_frame_adaptive(frameCount, this.updateParallel, this);

        return frameCount;
    };

    root.Game_Event.prototype.update.frame_adaptive = true;

    root.Game_Event.prototype.updateStop = function (frameCount) {
        var resCount;

        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this._locked) {
            this.resetStopCount();
        }
        frameCount = force_frame_adaptive(frameCount, root.Game_Character.prototype.updateStop, this);
        if (!this.isMoveRouteForcing()) {
            if (this.__SixLoves_Responsive__frameResidue === undefined) {
                this.__SixLoves_Responsive__frameResidue = 0;
            }

            resCount = this.__SixLoves_Responsive__frameResidue + frameCount;

            while (resCount >= 1) {
                this.updateSelfMovement();
                resCount -= 1;
            }

            this.__SixLoves_Responsive__frameResidue = resCount;
        }

        return frameCount;
    };

    root.Game_Event.prototype.updateStop.frame_adaptive = true;

    root.Game_Event.prototype.updateParallel = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this._interpreter) {
            if (!this._interpreter.isRunning()) {
                this._interpreter.setup(this.list(), this._eventId);
            }
            frameCount = force_frame_adaptive(frameCount, this._interpreter.update, this._interpreter);
        }

        return frameCount;
    };

    root.Game_Event.prototype.updateParallel.frame_adaptive = true;

    root.Game_Vehicle.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Game_Character.prototype.update, this);
        if (this.isAirship()) {
            frameCount = force_frame_adaptive(frameCount, this.updateAirship, this);
        }

        return frameCount;
    };

    root.Game_Vehicle.prototype.update.frame_adaptive = true;

    root.Game_Vehicle.prototype.updateAirship = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, this.updateAirshipAltitude, this);
        this.setStepAnime(this.isHighest());
        this.setPriorityType(this.isLowest() ? 0 : 2);

        return frameCount;
    };

    root.Game_Vehicle.prototype.updateAirship.frame_adaptive = true;

    root.Game_Vehicle.prototype.updateAirshipAltitude = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this._driving && !this.isHighest()) {
            this._altitude = Math.min(this._altitude + frameCount, this.maxAltitude());
        }
        if (!this._driving && !this.isLowest()) {
            this._altitude = Math.max(this._altitude - frameCount, 0);
        }

        return frameCount;
    };

    root.Game_Vehicle.prototype.updateAirshipAltitude.frame_adaptive = true;

    root.Game_Followers.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this.areGathering()) {
            if (!this.areMoving()) {
                //TODO: Does this do anything on a per-frame basis?
                this.updateMove();
            }
            if (this.areGathered()) {
                this._gathering = false;
            }
        }
        this.forEach(function (follower) {
            frameCount = force_frame_adaptive(frameCount, follower.update, follower);
        }, this);

        return frameCount;
    };

    root.Game_Followers.prototype.update.frame_adaptive = true;

    root.Game_Follower.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Game_Character.prototype.update, this);

        //TODO: Any of this need force_frame_adaptive or no?
        this.setMoveSpeed(root.$gamePlayer.realMoveSpeed());
        this.setOpacity(root.$gamePlayer.opacity());
        this.setBlendMode(root.$gamePlayer.blendMode());
        this.setWalkAnime(root.$gamePlayer.hasWalkAnime());
        this.setStepAnime(root.$gamePlayer.hasStepAnime());
        this.setDirectionFix(root.$gamePlayer.isDirectionFixed());
        this.setTransparent(root.$gamePlayer.isTransparent());

        return frameCount;
    };

    root.Game_Follower.prototype.update.frame_adaptive = true;

    root.Game_Timer.prototype.update = function (sceneActive, frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (sceneActive && this._working && this._frames > 0) {
            this._frames = Math.max(this._frames - frameCount, 0);
            if (this._frames === 0) {
                this.onExpire();
            }
        }

        return frameCount;
    };

    root.Game_Timer.prototype.update.frame_adaptive = true;

    root.Game_Screen.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, this.updateFadeOut, this);
        frameCount = force_frame_adaptive(frameCount, this.updateFadeIn, this);
        frameCount = force_frame_adaptive(frameCount, this.updateTone, this);
        frameCount = force_frame_adaptive(frameCount, this.updateFlash, this);
        frameCount = force_frame_adaptive(frameCount, this.updateShake, this);
        frameCount = force_frame_adaptive(frameCount, this.updateZoom, this);
        frameCount = force_frame_adaptive(frameCount, this.updateWeather, this);
        frameCount = force_frame_adaptive(frameCount, this.updatePictures, this);

        return frameCount;
    };

    root.Game_Screen.prototype.update.frame_adaptive = true;

    root.Game_Screen.prototype.updateFadeOut = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this._fadeOutDuration > 0) {
            var d = this._fadeOutDuration;
            this._brightness = (this._brightness * (d - frameCount)) / d;
            this._fadeOutDuration = Math.max(this._fadeOutDuration - frameCount, 0);
        }

        return frameCount;
    };

    root.Game_Screen.prototype.updateFadeOut.frame_adaptive = true;

    root.Game_Screen.prototype.updateFadeIn = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this._fadeInDuration > 0) {
            var d = this._fadeInDuration;

            // == CONFUSING MATH EXPLANATION ==
            //This and the above function use a little "micro LERP hack" for
            //code golfing reasons. It's fairly easy to adapt for adaptive
            //framerate when you are counting down. When you are counting up,
            //however, the formula doesn't work. So instead we just invert the
            //input and the output because we know counting down works better
            //than counting up.
            this._brightness = (255 - ((255 - this._brightness) * (d - frameCount)) / d);
            this._fadeInDuration = Math.max(this._fadeInDuration - frameCount, 0);
        }

        return frameCount;
    };

    root.Game_Screen.prototype.updateFadeIn.frame_adaptive = true;

    root.Game_Screen.prototype.updateTone = function (frameCount) {
        var d, i;

        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this._toneDuration > 0) {
            d = this._toneDuration;
            for (i = 0; i < 4; i += 1) {
                //We do the same thing here: count down to our target using
                //multiple confusing inversions. Or eversions. Or cocoron.
                this._tone[i] = this._toneTarget[i] - (((this._toneTarget[i] - this._tone[i]) * (d - frameCount)) / d);
            }
            this._toneDuration = Math.max(this._toneDuration - frameCount, 0);
        }

        return frameCount;
    };

    root.Game_Screen.prototype.updateTone.frame_adaptive = true;

    root.Game_Screen.prototype.updateFlash = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this._flashDuration > 0) {
            var d = this._flashDuration;
            this._flashColor[3] *= (d - frameCount) / d;
            this._flashDuration = Math.max(this._flashDuration - frameCount, 0);
        } else {
            this._flashColor[3] = 0;
        }

        return frameCount;
    };

    root.Game_Screen.prototype.updateFlash.frame_adaptive = true;

    root.Game_Screen.prototype.updateShake = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        //TODO: Test fast shakes with low frame counts and check temporal
        //aliasing behavior
        if (this._shakeDuration > 0 || this._shake !== 0) {
            var delta = (this._shakePower * this._shakeSpeed * this._shakeDirection) / 10 * frameCount;
            if (this._shakeDuration <= frameCount && this._shake * (this._shake + delta) < 0) {
                this._shake = 0;
            } else {
                this._shake += delta;
            }
            if (this._shake > this._shakePower * 2) {
                this._shakeDirection = -1;
            }
            if (this._shake < this._shakePower * -2) {
                this._shakeDirection = 1;
            }
            this._shakeDuration = Math.max(this._shakeDuration - frameCount, 0);
        }

        return frameCount;
    };

    root.Game_Screen.prototype.updateShake.frame_adaptive = true;

    root.Game_Screen.prototype.updateZoom = function (frameCount) {
        var d, t;

        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this._zoomDuration > 0) {
            d = this._zoomDuration;
            t = this._zoomScaleTarget;
            this._zoomScale = t - (((t - this._zoomScale) * (d - frameCount)) / d);
            this._zoomDuration = Math.max(this._zoomDuration - frameCount, 0);
        }

        return frameCount;
    };

    root.Game_Screen.prototype.updateZoom.frame_adaptive = true;

    root.Game_Screen.prototype.updateWeather = function (frameCount) {
        var d, t;

        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this._weatherDuration > 0) {
            d = this._weatherDuration;
            t = this._weatherPowerTarget;
            this._weatherPower = t - (((t - this._weatherPower) * (d - frameCount)) / d);
            this._weatherDuration = Math.max(this._weatherDuration - frameCount, 0);
            if (this._weatherDuration === 0 && this._weatherPowerTarget === 0) {
                this._weatherType = 'none';
            }
        }

        return frameCount;
    };

    root.Game_Screen.prototype.updateWeather.frame_adaptive = true;

    root.Game_Screen.prototype.updatePictures = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        this._pictures.forEach(function (picture) {
            if (picture) {
                frameCount = force_frame_adaptive(frameCount, picture.update, picture);
            }
        });

        return frameCount;
    };

    root.Game_Screen.prototype.updatePictures.frame_adaptive = true;

    root.Weather.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        this._updateDimmer();
        frameCount = force_frame_adaptive(frameCount, this._updateAllSprites, this);

        return frameCount;
    };

    root.Weather.prototype.update.frame_adaptive = true;

    root.Weather.prototype._updateAllSprites = function (frameCount) {
        var maxSprites = Math.floor(this.power * 10);

        if (frameCount === undefined) {
            frameCount = 1;
        }

        while (this._sprites.length < maxSprites) {
            this._addSprite();
        }
        while (this._sprites.length > maxSprites) {
            this._removeSprite();
        }

        this._sprites.forEach(function (sprite) {
            var spriteUpdater = this._updateSprite.bind(this, [sprite]);
            spriteUpdater.frame_adaptive = this._updateSprite.frame_adaptive;

            frameCount = force_frame_adaptive(frameCount, spriteUpdater, this);
            sprite.x = sprite.ax - this.origin.x;
            sprite.y = sprite.ay - this.origin.y;
        }, this);
    };

    root.Weather.prototype._updateAllSprites.frame_adaptive = true;

    root.Weather.prototype._updateSprite = function (sprite, frameCount) {
        var boundChild;

        if (frameCount === undefined) {
            frameCount = 1;
        }

        switch (this.type) {
        case 'rain':
            boundChild = this._updateRainSprite.bind(this, [sprite]);
            boundChild.frame_adaptive = this._updateRainSprite.frame_adaptive;
            break;
        case 'storm':
            boundChild = this._updateStormSprite.bind(this, [sprite]);
            boundChild.frame_adaptive = this._updateStormSprite.frame_adaptive;
            break;
        case 'snow':
            boundChild = this._updateSnowSprite.bind(this, [sprite]);
            boundChild.frame_adaptive = this._updateSnowSprite.frame_adaptive;
            break;
        }

        frameCount = force_frame_adaptive(frameCount, boundChild, this);

        if (sprite.opacity < 40) {
            this._rebornSprite(sprite);
        }

        return frameCount;
    };

    root.Weather.prototype._updateSprite.frame_adaptive = true;

    root.Weather.prototype._updateRainSprite = function (sprite, frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        sprite.bitmap = this._rainBitmap;
        sprite.rotation = Math.PI / 16;
        sprite.ax -= 6 * Math.sin(sprite.rotation) * frameCount;
        sprite.ay += 6 * Math.cos(sprite.rotation) * frameCount;
        sprite.opacity -= 6 * frameCount;

        return frameCount;
    };

    root.Weather.prototype._updateRainSprite.frame_adaptive = true;

    root.Weather.prototype._updateStormSprite = function (sprite, frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        sprite.bitmap = this._stormBitmap;
        sprite.rotation = Math.PI / 8;
        sprite.ax -= 8 * Math.sin(sprite.rotation) * frameCount;
        sprite.ay += 8 * Math.cos(sprite.rotation) * frameCount;
        sprite.opacity -= 8 * frameCount;

        return frameCount;
    };

    root.Weather.prototype._updateStormSprite.frame_adaptive = true;

    root.Weather.prototype._updateSnowSprite = function (sprite, frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        sprite.bitmap = this._snowBitmap;
        sprite.rotation = Math.PI / 16;
        sprite.ax -= 3 * Math.sin(sprite.rotation) * frameCount;
        sprite.ay += 3 * Math.cos(sprite.rotation) * frameCount;
        sprite.opacity -= 3 * frameCount;

        return frameCount;
    };

    root.Weather.prototype._updateSnowSprite.frame_adaptive = true;

    root.Sprite_Balloon.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Sprite_Base.prototype.update, this);
        this._duration = Math.max(this._duration - frameCount, 0);
        if (this._duration > 0) {
            this.updateFrame();
        }

        return frameCount;
    };

    root.Sprite_Balloon.prototype.update.frame_adaptive = true;

    root.Sprite_Picture.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Sprite.prototype.update, this);
        this.updateBitmap();
        if (this.visible) {
            this.updateOrigin();
            this.updatePosition();
            this.updateScale();
            this.updateTone();
            this.updateOther();
        }

        return frameCount;
    };

    root.Sprite_Picture.prototype.update.frame_adaptive = true;

    root.Sprite_Timer.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Sprite.prototype.update, this);
        this.updateBitmap();
        this.updatePosition();
        this.updateVisibility();

        return frameCount;
    };

    root.Sprite_Timer.prototype.update.frame_adaptive = true;

    root.Sprite_Destination.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Sprite.prototype.update, this);
        if (root.$gameTemp.isDestinationValid()) {
            this.updatePosition();
            frameCount = force_frame_adaptive(frameCount, this.updateAnimation, this);
            this.visible = true;
        } else {
            this._frameCount = 0;
            this.visible = false;
        }

        return frameCount;
    };

    root.Sprite_Destination.prototype.update.frame_adaptive = true;

    root.Sprite_Destination.prototype.updateAnimation = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        this._frameCount += frameCount;
        this._frameCount %= 20;
        this.opacity = (20 - this._frameCount) * 6;
        this.scale.x = 1 + this._frameCount / 20;
        this.scale.y = this.scale.x;

        return frameCount;
    };

    root.Sprite_Destination.prototype.updateAnimation.frame_adaptive = true;

    root.Spriteset_Base.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Sprite.prototype.update, this);
        this.updateScreenSprites();
        this.updateToneChanger();
        this.updatePosition();

        return frameCount;
    };

    root.Spriteset_Base.prototype.update.frame_adaptive = true;

    root.Spriteset_Map.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Spriteset_Base.prototype.update, this);
        this.updateTileset();
        this.updateParallax();
        this.updateTilemap();
        this.updateShadow();
        this.updateWeather();

        return frameCount;
    };

    root.Spriteset_Map.prototype.update.frame_adaptive = true;

    root.Sprite_Button.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Sprite.prototype.update, this);
        this.updateFrame();
        this.processTouch();

        return frameCount;
    };

    root.Sprite_Button.prototype.update.frame_adaptive = true;

    root.Sprite_Button.prototype.updateFrame = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        var frame;
        if (this._touching) {
            frame = this._hotFrame;
        } else {
            frame = this._coldFrame;
        }
        if (frame) {
            this.setFrame(frame.x, frame.y, frame.width, frame.height);
        }

        return frameCount;
    };

    root.Sprite_Button.prototype.updateFrame.frame_adaptive = true;

    /* Resize objects managed by the spriteset management code.
     */
    root.Spriteset_Base.prototype.layout = function () {
        var width = root.Graphics.boxWidth,
            height = root.Graphics.boxHeight,
            x = (root.Graphics.width - width) / 2,
            y = (root.Graphics.height - height) / 2;

        this.setFrame(0, 0, root.Graphics.width, root.Graphics.height);
        this._pictureContainer.setFrame(x, y, width, height);
        this._baseSprite.setFrame(0, 0, width, height);

        root.Sprite.prototype.layout.call(this);
    };

    /* Recreate the entire Map scene
     *
     * We do this instead of trying to properly size it's children because that
     * approach caused... problems. The Spritesheet or Tilemap always seemed to
     * be getting clipped on the edge you expanded from, for some reason.
     */
    root.Scene_Map.prototype.layout = function () {
        this.removeChildren();
        this.createDisplayObjects();

        root.Scene_Base.prototype.layout.call(this);
    };

    /* Make character sprites frame-responsive.
     */
    root.Sprite_Character.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Sprite_Base.prototype.update, this);
        frameCount = force_frame_adaptive(frameCount, this.updateBitmap, this);
        frameCount = force_frame_adaptive(frameCount, this.updateFrame, this);
        frameCount = force_frame_adaptive(frameCount, this.updatePosition, this);
        frameCount = force_frame_adaptive(frameCount, this.updateAnimation, this);
        frameCount = force_frame_adaptive(frameCount, this.updateBalloon, this);
        frameCount = force_frame_adaptive(frameCount, this.updateOther, this);

        return frameCount;
    };

    root.Sprite_Character.prototype.update.frame_adaptive = true;

    /* Here's some non-scalable Sprite_Character functions.
     *
     * Generally all of Sprite_Character's update code doesn't actually do any
     * animation, it just copies information from other objects that do.
     */
    root.Sprite_Character.prototype.updateBitmap.frame_adaptive = true;
    root.Sprite_Character.prototype.updateFrame.frame_adaptive = true;
    root.Sprite_Character.prototype.updatePosition.frame_adaptive = true;
    root.Sprite_Character.prototype.updateAnimation.frame_adaptive = true;
    root.Sprite_Character.prototype.updateBalloon.frame_adaptive = true;
    root.Sprite_Character.prototype.updateOther.frame_adaptive = true;
    root.Sprite_Character.prototype.updateVisibility.frame_adaptive = true;

    root.Window_MapName.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Window_Base.prototype.update, this);
        if (this._showCount > 0 && root.$gameMap.isNameDisplayEnabled()) {
            frameCount = force_frame_adaptive(frameCount, this.updateFadeIn, this);
            this._showCount -= frameCount;
        } else {
            frameCount = force_frame_adaptive(frameCount, this.updateFadeOut, this);
        }

        return frameCount;
    };

    root.Window_MapName.prototype.update.frame_adaptive = true;

    root.Window_MapName.prototype.updateFadeIn = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        this.contentsOpacity += 16 * frameCount;

        return frameCount;
    };

    root.Window_MapName.prototype.updateFadeIn.frame_adaptive = true;

    root.Window_MapName.prototype.updateFadeOut = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        this.contentsOpacity -= 16 * frameCount;

        return frameCount;
    };

    root.Window_MapName.prototype.updateFadeOut.frame_adaptive = true;

    /* == SPECIAL PURPOSE IMPLEMENTATIONS: BATTLE SCREEN == */
    root.Sprite_Battler.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Sprite_Base.prototype.update, this);

        if (this._battler) {
            frameCount = force_frame_adaptive(frameCount, this.updateMain, this);
            frameCount = force_frame_adaptive(frameCount, this.updateAnimation, this);
            frameCount = force_frame_adaptive(frameCount, this.updateDamagePopup, this);
            frameCount = force_frame_adaptive(frameCount, this.updateSelectionEffect, this);
        } else {
            this.bitmap = null;
        }

        return frameCount;
    };

    root.Sprite_Battler.prototype.update.frame_adaptive = true;

    root.Sprite_Actor.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Sprite_Battler.prototype.update, this);
        this.updateShadow();
        if (this._actor) {
            frameCount = force_frame_adaptive(frameCount, this.updateMotion, this);
        }

        return frameCount;
    };

    root.Sprite_Actor.prototype.update.frame_adaptive = true;

    root.Sprite_Actor.prototype.updateMotion = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Sprite_Battler.prototype.update, this);

        //I BELIEVE all of these are transitions that don't need framerate scaling
        this.setupMotion();
        this.setupWeaponAnimation();
        if (this._actor.isMotionRefreshRequested()) {
            this.refreshMotion();
            this._actor.clearMotion();
        }
        frameCount = force_frame_adaptive(frameCount, this.updateMotionCount, this);

        return frameCount;
    };

    root.Sprite_Actor.prototype.updateMotion.frame_adaptive = true;

    root.Sprite_Actor.prototype.updateMotionCount = function (frameCount) {
        var motionCountIterations;

        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this._motion) {
            //This is the code that is being replaced:
            //++this._motionCount >= this.motionSpeed()
            //I hate prefix operators

            this._motionCount += frameCount;

            if (this._motionCount >= this.motionSpeed()) {
                //Tricky logic follows to account for very low framerates
                //and/or very fast animations.

                motionCountIterations = Math.floor(this._motionCount / this.motionSpeed());

                if (this._motion.loop) {
                    this._pattern = (this._pattern + motionCountIterations) % 4;
                } else if (this._pattern < 2) {
                    this._pattern = Math.min(this._pattern + motionCountIterations, 2);
                } else {
                    this.refreshMotion();
                }
            }

            //Since we aren't incrementing by an integer anymore we need to
            //preserve left-over time caused by a frame update slightly after
            //when the animation switch should happen.
            this._motionCount = this._motionCount % this.motionSpeed();
        }

        return frameCount;
    };

    root.Sprite_Actor.prototype.updateMotionCount.frame_adaptive = true;

    root.Sprite_Enemy.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Sprite_Battler.prototype.update, this);
        if (this._enemy) {
            frameCount = force_frame_adaptive(frameCount, this.updateEffect, this);
            frameCount = force_frame_adaptive(frameCount, this.updateStateSprite, this);
        }

        return frameCount;
    };

    root.Sprite_Enemy.prototype.update.frame_adaptive = true;

    /* The only frame-scalable effect here is the adjustment of effectDuration.
     *
     * Though, some of the update functions mentioned here assume that variable
     * is always an integer, which is almost never going to be true in this
     * case. So to avoid missing sounds those functions are going to be updated
     * even though they get their timesource from _effectDuration instead of
     * the implicit timesource of being called as an update function.
     *
     * We also changed the switch out for actually checking the object for a
     * function of the appropriate name; this makes the code more consise and
     * would make it easier to add more Sprite_Enemy effects (if we bothered to
     * update some of the other functions...)
     */
    root.Sprite_Enemy.prototype.updateEffect = function (frameCount) {
        var desiredMethodName;

        if (frameCount === undefined) {
            frameCount = 1;
        }

        this.setupEffect();
        if (this._effectDuration > 0) {
            //We need to make sure _effectDuration does not become negative.
            this._effectDuration = Math.max(this._effectDuration - frameCount, 0);

            desiredMethodName = "update" + this._effectType[0].toUpperCase()
                                         + this._effectType.slice(1);

            //Not necessary at all, but I wanted to play code golf
            if (typeof this[desiredMethodName] === "function") {
                this[desiredMethodName]();
            } else {
                console.err("Invalid effect type " + this._effectType);
            }

            if (this._effectDuration === 0) {
                this._effectType = null;
            }
        }

        return frameCount;
    };

    root.Sprite_Enemy.prototype.updateEffect.frame_adaptive = true;

    /* This code itself doesn't advance the flow of time, but it does need to
     * be updated to handle noninteger _effectDuration times
     */
    root.Sprite_Enemy.prototype.updateBossCollapse = function () {
        this._shake = this._effectDuration % 2 * 4 - 2;
        this.blendMode = root.Graphics.BLEND_ADD;
        this.opacity *= this._effectDuration / (this._effectDuration + 1);
        this.setBlendColor([255, 255, 255, 255 - this.opacity]);

        //Since this function can now potentially be called multiple times in
        //the range of [19.0, 20] we need to actually use a variable to ensure
        //we don't fire twenty of the same sound effect.

        //In this case, we're allowing the effect to trigger anywhere in the
        //range of possible update times, so this code is actually dependent on
        //the updateFrameCap. We also allow triggering anywhere in this range
        //with the variable.

        //This implies that the updateFrameCap cannot be longer than 20 or
        //you're gonna have a bad time. Then again, 3fps isn't necessarily all
        //that playable either...

        //Original condition: if (this._effectDuration % 20 === 19)

        if (this._effectDuration % 20 >= (20 - root.SixLoves_Responsive.updateFrameCap)) {
            if (this.__FrameAdaptiveCheck_BossCollapse !== true) {
                root.SoundManager.playBossCollapse2();
                this.__FrameAdaptiveCheck_BossCollapse = true;
            }
        } else {
            //Reset for the next 20 frame window
            this.__FrameAdaptiveCheck_BossCollapse = false;
        }
    };

    /* Update function that has no frame-scalable effects. */
    root.Sprite_Enemy.prototype.updateStateSprite.frame_adaptive = true;

    root.Sprite_Damage.prototype.update = function (frameCount) {
        var boundChild, i;

        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Sprite.prototype.update, this);

        if (this._duration > 0) {
            this._duration = Math.max(this._duration - frameCount, 0);
            for (i = 0; i < this.children.length; i += 1) {
                //Preserve the frame_adaptive flag when binding arguments
                boundChild = this.updateChild.bind(this, this.children[i]);
                boundChild.frame_adaptive = this.updateChild.frame_adaptive;

                frameCount = force_frame_adaptive(frameCount, boundChild, this);
            }
        }
        frameCount = force_frame_adaptive(frameCount, this.updateFlash, this);
        frameCount = force_frame_adaptive(frameCount, this.updateOpacity, this);

        return frameCount;
    };

    root.Sprite_Damage.prototype.update.frame_adaptive = true;

    root.Sprite_Damage.prototype.updateFlash = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this._flashDuration > 0) {
            var d = this._flashDuration;
            this._flashDuration = Math.max(this._flashDuration - frameCount, 0);
            this._flashColor[3] *= (d - frameCount) / d;
        }

        return frameCount;
    };

    root.Sprite_Damage.prototype.updateFlash.frame_adaptive = true;

    /* Does not contain time-advancing code. */
    root.Sprite_Damage.prototype.updateOpacity.frame_adaptive = true;
    root.Sprite_Damage.prototype.updateChild.frame_adaptive = true;

    //Okay, so RPG Maker for some reason has two separate Sprite classes that
    //together provide the same methods but not a single subclass for these
    //kinds of "run a bunch of animations at a certain speed" functions...
    root.Sprite_StateIcon.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Sprite.prototype.update, this);

        this._animationCount += frameCount;
        while (this._animationCount >= this.animationWait()) {
            this.updateIcon();
            this.updateFrame();
            this._animationCount = this._animationCount - this.animationWait();
        }

        return frameCount;
    };

    root.Sprite_StateIcon.prototype.update.frame_adaptive = true;

    root.Sprite_StateOverlay.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Sprite_Base.prototype.update, this);
        this._animationCount += frameCount;
        while (this._animationCount >= this.animationWait()) {
            this.updatePattern();
            this.updateFrame();
            this._animationCount = this._animationCount - this.animationWait();
        }

        return frameCount;
    };

    root.Sprite_StateOverlay.prototype.update.frame_adaptive = true;

    root.Sprite_Weapon.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Sprite_Base.prototype.update, this);
        this._animationCount += frameCount;
        while (this._animationCount >= this.animationWait()) {
            this.updatePattern();
            this.updateFrame();
            this._animationCount = this._animationCount - this.animationWait();
        }

        return frameCount;
    };

    root.Sprite_Weapon.prototype.update.frame_adaptive = true;

    root.Spriteset_Battle.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Spriteset_Base.prototype.update, this);
        this.updateActors();
        this.updateBattleback();

        return frameCount;
    };
    
    /* Spriteset_Battle creates a tiling sprite to render the battle backgrounds
     * which IMHO is the wrong choice: none of the battle backgrounds available
     * are tileable.
     */
    root.Spriteset_Battle.prototype.createBattleback = function () {
        var margin = 32;
        var x = -this._battleField.x - margin;
        var y = -this._battleField.y - margin;
        var width = Graphics.width + margin * 2;
        var height = Graphics.height + margin * 2;
        this._back1Sprite = new Sprite();
        this._back2Sprite = new Sprite();
        this._back1Sprite.bitmap = this.battleback1Bitmap();
        this._back2Sprite.bitmap = this.battleback2Bitmap();
        this._back1Sprite.move(x, y, width, height);
        this._back2Sprite.move(x, y, width, height);
        this._battleField.addChild(this._back1Sprite);
        this._battleField.addChild(this._back2Sprite);
    };
    
    function cover(sprite, parent) {
        var x = 0, y = 0, width, height, centerPt, zoomFactor,
            parentAR = parent.width / parent.height,
            spriteAR = sprite.bitmap.width / sprite.bitmap.height;
        
        if (parentAR > spriteAR) { //Parent is wider than sprite
            zoomFactor = parent.width / sprite.bitmap.width;
            height = sprite.bitmap.width / spriteAR * zoomFactor;
            width = parent.width;
            x = 0;
            y = (height - parent.height) / -2;
            
        } else { //Parent is taller than sprite
            zoomFactor = parent.height / sprite.bitmap.height;
            width = sprite.bitmap.height * spriteAR * zoomFactor;
            height = parent.height;
            x = (width - parent.width) / -2;
            y = 0;
        }
        
        sprite.setFrame(0, 0, width, height);
        sprite.position.x = x;
        sprite.position.y = y;
        sprite.scale.x = zoomFactor;
        sprite.scale.y = zoomFactor;
    }
    
    /* Also, we have to patch this as Sprite is adjusted differently from
     * TilingSprite
     */
    root.Spriteset_Battle.prototype.locateBattleback = function() {
        var width = this._battleField.width,
            height = this._battleField.height,
            sprite1 = this._back1Sprite,
            sprite2 = this._back2Sprite,
            sprite1AR = sprite1.bitmap.width / sprite1.bitmap.height,
            sprite2AR = sprite2.bitmap.width / sprite2.bitmap.height,
            graphicsAR = width / height;
        
        cover(sprite1, this._battleField);
        cover(sprite2, this._battleField);
        
        //TODO: test side view
        if ($gameSystem.isSideView()) {
            sprite1.setFrame(sprite1.frame.x, sprite1.x + sprite1.bitmap.height - height, width, height);
            sprite2.setFrame(sprite2.frame.x, sprite1.y + sprite2.bitmap.height - height, width, height);
        }
    };
    
    /* Add a layout method */
    root.Spriteset_Battle.prototype.layout = function () {
        var width = Graphics.boxWidth,
            height = Graphics.boxHeight,
            x = (Graphics.width - width) / 2,
            y = (Graphics.height - height) / 2;
        
        this.setFrame(0, 0, Graphics.width, Graphics.height);
        this.width = Graphics.width;
        this.height = Graphics.height;
        
        if (this._baseSprite) {
            this._baseSprite.setFrame(0, 0, this.width, this.height);
            this._baseSprite.filterArea.width = this.width;
            this._baseSprite.filterArea.height = this.height;
        }
        
        if (this._battleField) {
            this._battleField.setFrame(0, 0, this.width, this.height);
            this._battleField.x = 0;
            this._battleField.y = 0;
        }
        
        this.locateBattleback();
        
        root.Spriteset_Base.prototype.layout.call(this);
    }

    /* BattleLog stuff.
     *
     * This implementation is particularly difficult as some of these update
     * functions already return values. so we can't use the force adaptive
     * trick. Any plugins that alter the speed of the built-in battle system
     * are going to run at incorrect speeds unless they include frame-adaptive
     * code.
     */
    root.Window_BattleLog.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (!this.updateWait(frameCount)) {
            this.callNextMethod();
        }

        return frameCount;
    };

    root.Window_BattleLog.prototype.update.frame_adaptive = true;

    root.Window_BattleLog.prototype.updateWait = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        return this.updateWaitCount(frameCount) || this.updateWaitMode(frameCount);
    };

    root.Window_BattleLog.prototype.update.frame_adaptive = true;

    root.Window_BattleLog.prototype.updateWaitCount = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this._waitCount > 0) {
            this._waitCount -= (this.isFastForward() ? 3 : 1) * frameCount;
            if (this._waitCount < 0) {
                this._waitCount = 0;
            }
            return true;
        }
        return false;
    };

    root.Window_BattleLog.prototype.updateWaitCount.frame_adaptive = true;
    root.Window_BattleLog.prototype.updateWaitMode.frame_adaptive = true;

    /* == SPECIAL PURPOSE IMPLEMENTATIONS: ITEM SCREEN == */
    root.Window_ItemCategory.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Window_HorzCommand.prototype.update, this);

        if (this._itemWindow) {
            this._itemWindow.setCategory(this.currentSymbol());
        }

        return frameCount;
    };

    root.Window_ItemCategory.prototype.update.frame_adaptive = true;

    /* == SPECIAL PURPOSE IMPLEMENTATIONS: SKILLS SCREEN == */
    root.Window_SkillType.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Window_Command.prototype.update, this);

        if (this._skillWindow) {
            this._skillWindow.setStypeId(this.currentExt());
        }

        return frameCount;
    };

    root.Window_SkillType.prototype.update.frame_adaptive = true;

    /* == SPECIAL PURPOSE IMPLEMENTATIONS: EQUIP SCREEN == */
    root.Window_EquipSlot.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Window_Selectable.prototype.update, this);

        if (this._itemWindow) {
            this._itemWindow.setSlotId(this.index());
        }

        return frameCount;
    };

    root.Window_EquipSlot.prototype.update.frame_adaptive = true;

    /* == SPECIAL PURPOSE IMPLEMENTATIONS: SHOP SCREEN == */
    root.Window_ShopNumber.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Window_Selectable.prototype.update, this);
        frameCount = force_frame_adaptive(frameCount, this.processNumberChange, this);

        return frameCount;
    };

    root.Window_ShopNumber.prototype.update.frame_adaptive = true;

    /* This doesn't LOOK like something that should be frame-adaptive, but is.
     *
     * If it's not set to be frame-adaptive then the speed at which repeated
     * key inputs increase or decrease the shop number will vary based on
     * framerate. In some cases it might make selecting certain numbers
     * unnecessarily difficult, so we're going to fix that.
     *
     * There's some REALLY subtle behavior here, too; even in a low-FPS
     * situation we still want to be able to scroll up exactly 1, but have a
     * hold behavior that scales up with framerate. If we were to just naively
     * call changeNumber scaled by the integer frame count, then high-FPS users
     * wouldn't be able to scroll this prompt and low-FPS users wouldn't be
     * able to scroll slowly.
     *
     * So what we do is actively check if the input has been long-pressed and
     * scale up the speed only in that case. This ensures that number windows
     * "feel" as you would expect regardless of framerate.
     *
     * We also do a whole bunch of stuff to keep track with how much time was
     * lost by rounding the frame count to an integer multiple.
     */
    root.Window_ShopNumber.prototype.processNumberChange = function (frameCount) {
        var digitDirection, digitMagnitude, integerFrameCount;

        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount += this.__FrameAdaptiveResidue_DigitChange || 0;

        if (this.isOpenAndActive()) {
            if (root.Input.isRepeated('right')) {
                digitMagnitude = 1;
            }
            if (root.Input.isRepeated('left')) {
                digitMagnitude = -1;
            }
            if (root.Input.isRepeated('up')) {
                digitMagnitude = 10;
            }
            if (root.Input.isRepeated('down')) {
                digitMagnitude = -10;
            }
        }

        if (digitMagnitude !== undefined) {
            if (root.Input.isLongPressed('up') || root.Input.isLongPressed('down') ||
                    root.Input.isLongPressed('left') || root.Input.isLongPressed('right')) {

                integerFrameCount = Math.floor(frameCount);
                this.__FrameAdaptiveResidue_DigitChange = frameCount - integerFrameCount;
                this.changeNumber(digitMagnitude * integerFrameCount);
            } else {
                this.__FrameAdaptiveResidue_DigitChange = 0;
                this.changeNumber(digitMagnitude);
            }
        }

        return frameCount;
    };

    root.Window_ShopNumber.prototype.processNumberChange.frame_adaptive = true;

    root.Window_ShopStatus.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Window_Base.prototype.update, this);
        frameCount = force_frame_adaptive(frameCount, this.updatePage, this);

        return frameCount;
    };

    root.Window_ShopStatus.prototype.update.frame_adaptive = true;

    root.Window_NumberInput.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Window_Selectable.prototype.update, this);
        frameCount = force_frame_adaptive(frameCount, this.processDigitChange, this);

        return frameCount;
    };

    root.Window_NumberInput.prototype.update.frame_adaptive = true;

    /* Roughly the same deal as the Window_ShopNumber code. We ensure that the
     * long-pressed digit adjustments happen at 60fps while keeping the first
     * keypress always incrementing by one.
     */
    root.Window_NumberInput.prototype.processDigitChange = function (frameCount) {
        var changeDigitDirection,
            integerFrameCount;

        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount += this.__FrameAdaptiveResidue_DigitChange || 0;

        if (this.isOpenAndActive()) {
            if (root.Input.isRepeated('up')) {
                changeDigitDirection = true;
            } else if (root.Input.isRepeated('down')) {
                changeDigitDirection = false;
            }

            if (changeDigitDirection !== undefined) {
                if (root.Input.isLongPressed('up') || root.Input.isLongPressed('down')) {
                    integerFrameCount = Math.floor(frameCount);
                    this.__FrameAdaptiveResidue_DigitChange = frameCount - integerFrameCount;
                    this.changeDigit(changeDigitDirection, integerFrameCount);
                } else {
                    this.__FrameAdaptiveResidue_DigitChange = 0;
                    this.changeDigit(changeDigitDirection);
                }
            } else {
                this.__FrameAdaptiveResidue_DigitChange = 0;
            }
        } else {
            this.__FrameAdaptiveResidue_DigitChange = 0;
        }

        return frameCount;
    };

    root.Window_NumberInput.prototype.processDigitChange.frame_adaptive = true;

    /* To avoid firing too many cursor sounds at once we have to rewrite this
     * to allow incrementing the digit by multiple numbers
     */
    root.Window_NumberInput.prototype.changeDigit = function (up, count) {
        var index = this.index(),
            place = Math.pow(10, this._maxDigits - 1 - index),
            n = Math.floor(this._number / place) % 10;

        count = Math.abs(count || 1);

        this._number -= n * place;

        while (count > 0) {
            count -= 1;
            if (up) {
                n = (n + 1) % 10;
            } else {
                n = (n + 9) % 10;
            }
        }

        this._number += n * place;
        this.refresh();
        root.SoundManager.playCursor();
    };

    /* == SPECIAL PURPOSE IMPLEMENTATIONS: MESSAGE SCREEN == */
    root.Window_Message.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        this.checkToNotClose();
        frameCount = force_frame_adaptive(frameCount, root.Window_Base.prototype.update, this);
        while (!this.isOpening() && !this.isClosing()) {
            if (this.updateWait(frameCount)) {
                return;
            } else if (this.updateLoading()) {
                return;
            } else if (this.updateInput()) {
                return;
            } else if (this.updateMessage(frameCount)) {
                return;
            } else if (this.canStart()) {
                this.startMessage();
            } else {
                this.startInput();
                return;
            }
        }

        return frameCount;
    };

    root.Window_Message.prototype.update.frame_adaptive = true;

    root.Window_Message.prototype.updateWait = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this._waitCount > 0) {
            this._waitCount = Math.max(this._waitCount - frameCount, 0);
            return true;
        } else {
            return false;
        }

        //We can't actually return framecount here, which means this function
        //also can't be forced frame adaptive either.
    };

    root.Window_Message.prototype.updateMessage = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        //See if we have any excess time we left previously
        if (this.__SixLoves_Responsive__messageFrameResidue === undefined) {
            this.__SixLoves_Responsive__messageFrameResidue = 0;
        }

        frameCount += this.__SixLoves_Responsive__messageFrameResidue;

        if (this._textState) {
            while (!this.isEndOfText(this._textState) && frameCount >= 1) {
                if (this.needsNewPage(this._textState)) {
                    this.newPage(this._textState);
                }
                this.updateShowFast();
                this.processCharacter(this._textState);
                if (!this._showFast && !this._lineShowFast) {
                    //Instead of breaking, decrement the framecount so we can
                    //see if we have to write more letters to keep up with the
                    //text speed
                    frameCount -= 1;
                }
                if (this.pause || this._waitCount > 0) {
                    //waiting should kill remaining frame residue
                    frameCount = 0;
                    break;
                }
            }

            if (this.isEndOfText(this._textState)) {
                this.onEndOfText();
            }

            this.__SixLoves_Responsive__messageFrameResidue = frameCount;
            return true;
        } else {
            return false;
        }
    };

    root.Window_ScrollText.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Window_Base.prototype.update, this);
        if (root.$gameMessage.scrollMode()) {
            if (this._text) {
                frameCount = force_frame_adaptive(frameCount, this.updateMessage, this);
            }
            if (!this._text && root.$gameMessage.hasText()) {
                this.startMessage();
            }
        }

        return frameCount;
    };

    root.Window_ScrollText.prototype.update.frame_adaptive = true;

    root.Window_ScrollText.prototype.updateMessage = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        this.origin.y += this.scrollSpeed() * frameCount;
        if (this.origin.y >= this.contents.height) {
            this.terminateMessage();
        }

        return frameCount;
    };

    root.Window_ScrollText.prototype.updateMessage.frame_adaptive = true;
    
    /* == SPECIAL PURPOSE IMPLEMENTATIONS: Battle system == */
    root.Scene_Battle.prototype.update = function (frameCount) {
        var $gtTimer,
            active = this.isActive();
        
        if (frameCount === undefined) {
            frameCount = 1;
        }
        
        $gtTimer = root.$gameTimer.update.bind(root.$gameTimer, [active]);
        $gtTimer.frame_adaptive = root.$gameTimer.update.frame_adaptive;
        
        frameCount = force_frame_adaptive(frameCount, $gtTimer, root.$gameTimer);
        frameCount = force_frame_adaptive(frameCount, root.$gameScreen.update, root.$gameScreen);
        frameCount = force_frame_adaptive(frameCount, this.updateStatusWindow, this);
        frameCount = force_frame_adaptive(frameCount, this.updateWindowPositions, this);
        if (active && !this.isBusy()) {
            frameCount = force_frame_adaptive(frameCount, this.updateBattleProcess, this);
        }
        frameCount = force_frame_adaptive(frameCount, root.Scene_Base.prototype.update, this);
        
        return frameCount;
    };
    
    root.Scene_Battle.prototype.update.frame_adaptive = true;
    
    root.Scene_Battle.prototype.updateStatusWindow = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }
        
        if (root.$gameMessage.isBusy()) {
            this._statusWindow.close();
            this._partyCommandWindow.close();
            this._actorCommandWindow.close();
        } else if (this.isActive() && !this._messageWindow.isClosing()) {
            this._statusWindow.open();
        }
        
        return frameCount;
    };
    
    root.Scene_Battle.prototype.updateStatusWindow.frame_adaptive = true;
    
    root.Scene_Battle.prototype.updateWindowPositions = function (frameCount) {
        var statusX = 0;
        
        if (frameCount === undefined) {
            frameCount = 1;
        }
        
        if (root.BattleManager.isInputting()) {
            statusX = this._partyCommandWindow.width;
        } else {
            statusX = this._partyCommandWindow.width / 2;
        }
        
        if (this._statusWindow.x < statusX) {
            this._statusWindow.x = Math.min(this._statusWindow.x + 16 * frameCount, statusX);
        }
        
        if (this._statusWindow.x > statusX) {
            this._statusWindow.x = Math.max(this._statusWindow.x - 16 * frameCount, statusX);
        }
        
        return frameCount;
    };
    
    root.Scene_Battle.prototype.updateWindowPositions.frame_adaptive = true;
    
    root.Scene_Battle.prototype.updateBattleProcess = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }
        
        if (!this.isAnyInputWindowActive() || root.BattleManager.isAborting() ||
                root.BattleManager.isBattleEnd()) {
            //TODO: Does BattleManager contain any code that needs patching?
            root.BattleManager.update();
            this.changeInputWindow();
        }
        
        return frameCount;
    };
    
    root.Scene_Battle.prototype.updateBattleProcess.frame_adaptive = true;
    
    root.Game_Timer.prototype.update = function (sceneActive, frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }
        
        if (sceneActive && this._working && this._frames > 0) {
            this._frames = Math.max(this._frames - frameCount, 0);
            if (this._frames === 0) {
                this.onExpire();
            }
        }
        
        return frameCount;
    };
    
    root.Game_Timer.prototype.update.frame_adaptive = true;
    
    /* == SPECIAL PURPOSE IMPLEMENTATIONS: Debug menu == */
    root.Window_DebugRange.prototype.update = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        frameCount = force_frame_adaptive(frameCount, root.Window_Selectable.prototype.update, this);

        //TODO: Figure out what this does and if we need to debugify it.
        if (this._editWindow) {
            this._editWindow.setMode(this.mode());
            this._editWindow.setTopId(this.topId());
        }

        return frameCount;
    };

    root.Window_DebugRange.prototype.update.frame_adaptive = true;
    
    module.status = "loaded";
    module.version = "0.3.0";
}(this, this.SixLoves_Responsive_MVCore));
