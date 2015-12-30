/*jslint nomen:false*/
/*global console*/

/*:
 * @author David Wendt (fantranslation.org)
 * @plugindesc Makes your game responsive. v0.2.0
 * 
 * @param ArtScale
 * @desc The intended scale of your art assets. (RPG Maker MV default: 1.5)
 * @default 1.5
 * 
 * @param MinWidth
 * @desc The minimum width of the playfield, in virtual pixel units.
 * @default 544
 * 
 * @param MinHeight
 * @desc The minimum height of the playfield, in virtual pixel units.
 * @default 416
 * 
 * @param MaxWidth
 * @desc The maximum width of the playfield, in virtual pixel units.
 * @default 816
 * 
 * @param MaxHeight
 * @desc The maximum height of the playfield, in virtual pixel units.
 * @default 624
 * 
 * @param DesignFPS
 * @desc FPS that the game was originally designed for.
 * @default 60
 *
 * @param UpdateFrameCap
 * @desc Maximum number of updates to run per animation frame.
 * @default 4
 *
 * @param DebugFPS
 * @desc FPS that the game should run at, for debugging purposes.
 * @default undefined
 *
 * @param DebugBreakOnNonadaptive
 * @desc If "true", execution will halt on nonadaptive code.
 * @default false
 *
 * @param DebugLogMessages
 * @desc If "true", log classes containing legacy code needing to be updated.
 * @default false
 *
 * @help
 * 
 *      Adjusts various aspects of an RPG Maker MV game engine to improve
 * flexibility in different ways. Adjusts viewport size, window sizing, and
 * update frequency to ensure various the game adapts to various corner cases.
 * For example, this plugin can adjust your game's playfield to fit the screen
 * viewport it has, such that there are no letterboxing bars and the scale of
 * rendered art assets corresponds to some physical quantity.
 *
 *  = Adaptive Viewport =
 * 
 *      This plugin's main advantage is that you can design games with detailed
 * art for high-density displays without forcing players on lower-density
 * monitors to view excessively large sprites. Art is scaled up or down as
 * needed such that the final result is at a visually appropriate size for any
 * monitor.
 * 
 *      You can also define a minimum size for your playfield. Viewports smaller
 * than this will have their art assets shrunk further to ensure a minimum
 * amount of virtual screen space is available to the user interface.
 * Additionally, a maximum size can also be defined to prevent assets from
 * becoming too small and the playfield too large. If these two parameters are
 * in conflict, the maximum size will override the minimum size. (Such a
 * situation may happen if the viewport is not tall enough for the minimum
 * height, but wide enough to exceed maximum width.)
 * 
 *      Maximum and minimum size defaults are set to the sizes of the default
 * RPG Maker MV and VX Ace viewports, respectively. You may wish to adjust them
 * based on your target platform. In that case, please keep in mind that the
 * units for these parameters are specified in virtual units, so if you increase
 * your ArtScale, the sizes specified here do not need to be increased.
 * 
 *      Please note that this plugin does not currently adjust UI to account for
 * a higher or lower ArtScale. You must first provide all other parts of RPG
 * Maker high-resolution assets to increase the size of all content, and then
 * use ArtScale to shrink the content of the game back down to the same apparant
 * size.
 * 
 *      This plugin creates a new method for Scenes and Windows called layout.
 * This method is called to force the target object to adjust it's contents to
 * fit a different screen size. Default implementations for the base game's
 * scenes and windows will be created. Additional scenes and windows in other
 * plugins or your own code should have layout methods created for them if the
 * defaults are unsuitable. The default implementations will use existing layout
 * properties where available. Developers of custom Window or Scene classes
 * should take a look at what this plugin does to ensure nothing breaks when it
 * is enabled.
 *
 *  = Adaptive Framerate =
 *
 *      The plugin additionally supports adjusting the speed of game logic to
 * be framerate independent. As RPG Maker MV was not designed for this at all,
 * we accomplish this by firing multiple update calls to catch up with where
 * the game should be. Effectively, frames are reinterpreted as a physical unit
 * of time equal to the reciprocal of the DesignFPS rate, or 1/60 seconds.
 *
 *      This facility is limited by the UpdateFrameCap, which prevents the game
 * from running ridiculous numbers of updates in situations where the game
 * hasn't been running at all. (According to web standards, the browser is
 * permitted to ramp down framerates or even cease updates for an arbitrary
 * amount of time.) It sets an effective minimum FPS floor equal to the
 * DesignFPS divided by the UpdateFrameCap.
 *
 *      Please note that this functionality does not allow us to update at a
 * faster clip than 60 FPS, even if your monitor supports it. We cannot update
 * half a frame's worth of time with the standard RPG Maker MV codebase.
 * However, we can modify existing update functions to support adaptive update
 * rates.
 *
 *      To do this, you must alter the relevant update functions to accept a
 * numerical parameter indicating how many updates are intended to be processed
 * at once. This parameter MUST be allowed to be provided as a fraction and
 * your update function must scale all animations by that amount. Because we
 * provide frame counts as a multiple of the design framerate, you do not need
 * to adjust your existing design parameters to match - e.g. if you set a
 * character to move 10 pixels across the viewport per frame, and you designed
 * and tested this existing functionality at 60FPS, you merely need to multiply
 * by the provided number to get the number of pixels that the character should
 * move.
 *
 *      Alongside accepting a frame count as a parameter, your update function
 * should also return the amount of frames actually consumed. This is used to
 * allow update functions to control the actual flow of update calls over time.
 *
 *      Note that your code should not attempt to call other functions that
 * advance the flow of time on it's own. Instead, this module exports a
 * function called "force_frame_adaptive" which accepts the current frameCount,
 * the desired update function, and the object it's to be called on. It will
 * then call that function, either once for frame_adaptive code, or multiple
 * times for legacy code, to ensure that the flow of time remains consistent.
 *
 *      You can find this function in SixLoves_Responsive; if not present, you
 * should not provide your own code. If your plugin is intended to run in both
 * environments - repsonsive and non-responsive - then you should, in the case
 * where the plugin is missing, use a fallback function that merely calls the
 * code without any special legacy handling. You should not attempt to
 * duplicate the legacy code handling in this plugin as it is subject to change
 * and fairly complex.
 *
 *      Legacy autodetect relies on properly marking frame-adaptive update
 * functions by use of a special variable on the function object, like so:
 *
 *      MySceneClass.prototype.update.frame_adaptive = true
 *
 *      This necessitates writing frame-adaptive code in a flexible manner that
 * supports being called from non-frame-adaptive code. Look at the source code
 * of this plugin for an example of this style.
 *
 *      Please note that this property is only inherited in the case where the
 * function is unchanged from parent to child class. Overriding the function,
 * either by declaring a new one on the child class's prototype or replacing
 * the existing one on the parent class's prototype, will erase this property.
 * Update functions must individually opt-in to this scheme. If you override a
 * frame_adaptive function, you must also redeclare your frame_adaptive-ness.
 *
 *      For testing your own code, you may want to change DebugFPS to something
 * other than the default "undefined", which will lock the game to an arbitrary
 * FPS of your choosing. This will cause it to explicitly run faster or slower.
 * For example, on a 60fps monitor, a DebugFPS of 30 should run half as fast
 * and a DebugFPS of 120 should run twice as fast.
 *
 *      In exceptionally rare cases the design FPS may have been altered from
 * the stock 60FPS. For example, a developer who already adjusted their code to
 * work on faster or slower monitors may need to use this plugin. In this case
 * you may change the DesignFPS to speed up or slow down the game at all
 * possible refresh rates. Please note that you should probably not do this.
 */

this.SixLoves_Responsive = this.SixLoves_Responsive || {};

(function (root, module) {
    "use strict";
    
    var parameters = root.PluginManager.parameters('SixLoves_Responsive'),
        artScale = Number(parameters.ArtScale || 1.5),
        minWidth = Number(parameters.MinWidth || 544),
        minHeight = Number(parameters.MinHeight || 416),
        maxWidth = Number(parameters.MaxWidth || 816),
        maxHeight = Number(parameters.MaxHeight || 624),
        
        designFPS = Number(parameters.DesignFPS || 60),
        debugFPS = (parameters.DebugFPS !== undefined &&
                    parameters.DebugFPS !== "undefined") ? Number(parameters.DebugFPS) : undefined,
        debugBreakOnNonAdaptive = (parameters.DebugBreakOnNonadaptive === undefined ||
                                   parameters.DebugBreakOnNonadaptive === "false") ? false : true,
        debugLogMessages = (parameters.DebugLogMessages === undefined ||
                            parameters.DebugLogMessages === "false") ? false : true,
        updateFrameCap = Number(parameters.UpdateFrameCap || 3),

        nonAdaptive = [],
        nonResponsive = [],

        /* Preceding implementations of patched code. */
        _SceneManager_initGraphics = root.SceneManager.initGraphics,
        _Graphics_centerElement = root.Graphics._centerElement;
    
    if (debugFPS !== undefined) {
        console.warn("Debugging framerate is on. You should turn this off if you are not testing update logic.");
    }

    /* == FRAME-RATE ADAPTIVE GAME LOGIC == */

    /* Helper function that repeatedly executes an update callback to emulate
     * adaptive behavior.
     */
    function force_frame_adaptive(frameCount, updateCallback, updateThis) {
        var framesExecuted = 0,
            constructorName;

        if (updateCallback.frame_adaptive === true) {
            framesExecuted = updateCallback.apply(updateThis, [frameCount]);

            //For whatever reason, a particular bit of code may not actually
            //contain any frame-scalable effects but we still want to avoid
            //running it multiple times. This bit here lets us mark code as
            //frame-adaptive without changing it if we want.
            if (framesExecuted === undefined) {
                return frameCount;
            }

            return framesExecuted;
        } else {
            if (debugBreakOnNonAdaptive) {
                debugger;
            }

            if (nonAdaptive.indexOf(updateThis.constructor.name) === -1) {
                nonAdaptive.push(updateThis.constructor.name);
            }
        }

        frameCount = Math.ceil(frameCount);

        while (framesExecuted < frameCount) {
            framesExecuted += 1;
            updateCallback.apply(updateThis);
        }

        return framesExecuted;
    }

    /* Code which adjusts the gameloop to run at the same physical speed
     * regardless of the rate at which the browser fires animation frames.
     */
    root.SceneManager.update = function (timeStamp) {
        var frameSkip,
            actualFrameSkip = 0;

        //Clear the debugging list of nonadaptive functions.
        nonAdaptive = [];

        //Ensure we have a timestamp to compare to.
        //We can't run any adaptive code until we have a delta.
        if (this.lastTimeStamp === undefined) {
            this.lastTimeStamp = timeStamp;
            return this.requestUpdate();
        }

        //accumulatedExcessTime is used to keep track of time that hasn't
        //been consumed by the underlying frame update functions.
        if (this.accumulatedExcessTime === undefined) {
            this.accumulatedExcessTime = 0;
        }

        //This tells us how many updates need to run since the last run.
        frameSkip = (timeStamp - this.lastTimeStamp) / 1000 * designFPS;

        //Also, add in any excess time not accounted for by the previous update
        //and apply our update cap.
        frameSkip = Math.min(frameSkip + this.accumulatedExcessTime,
                             module.updateFrameCap);

        if (debugFPS !== undefined) {
            frameSkip = designFPS / debugFPS;
        }

        try {
            this.tickStart();
            this.updateInputData();

            actualFrameSkip = force_frame_adaptive(frameSkip, this.updateMain, this);

            this.tickEnd();
        } catch (e) {
            this.catchException(e);
        }

        if (nonAdaptive.length > 0 && debugLogMessages) {
            console.warn("Please update classes " + nonAdaptive.join(", ") + " to support frame adaptive code.");
        }

        //Store any frame time that the update function didn't use.
        this.accumulatedExcessTime = Math.max(frameSkip - actualFrameSkip, 0);
        this.lastTimeStamp = timeStamp;
    };

    root.SceneManager.update.frame_adaptive = true;

    /* Adjust updateMain to also support frame_adaptive behavior.
     *
     * Note that if this function is NOT frame_adaptive, it WILL cause the game
     * to constantly spin and request more and more animation frames, making
     * the game spin out of control and die very quickly.
     */
    root.SceneManager.updateMain = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        this.changeScene();
        frameCount = force_frame_adaptive(frameCount, this.updateScene, this);
        this.renderScene();
        this.requestUpdate();

        return frameCount;
    };

    root.SceneManager.updateMain.frame_adaptive = true;

    /* Adjust updateScene to support frame_adaptive scenes.
     *
     * This also changes the scene starting logic a bit: scene starting always
     * takes one update call regardless of how many frames actually passed.
     */
    root.SceneManager.updateScene = function (frameCount) {
        if (frameCount === undefined) {
            frameCount = 1;
        }

        if (this._scene) {
            if (!this._sceneStarted && this._scene.isReady()) {
                this._scene.start();
                this._sceneStarted = true;
                this.onSceneStart();
            }
            if (this.isCurrentSceneStarted()) {
                frameCount = force_frame_adaptive(frameCount, this._scene.update, this._scene);
            }
        }

        return frameCount;
    };

    root.SceneManager.updateScene.frame_adaptive = true;

    /* == RESPONSIVE VIEWPORT LOGIC == */

    /* Code which resizes the Graphics viewport to match the screen, and scale
     * art assets down to their appropriate physical size.
     * (e.g. it allows high-DPI assets to be high-DPI when needed)
     */
    function adapt_to_viewport() {
        var finalScale = artScale,
            cssWidth = window.innerWidth,
            cssHeight = window.innerHeight;
        
        if (cssWidth < minWidth || cssHeight < minHeight) {
            finalScale = artScale / Math.min(cssWidth / minWidth,
                                             cssHeight / minHeight);
        }
        
        if (cssWidth > maxWidth || cssHeight > maxHeight) {
            finalScale = artScale / Math.max(cssWidth / maxWidth,
                                             cssHeight / maxHeight);
        }

        root.Graphics.width = Math.round(cssWidth * finalScale);
        root.Graphics.height = Math.round(cssHeight * finalScale);
        root.Graphics.boxWidth = Math.round(cssWidth * finalScale);
        root.Graphics.boxHeight = Math.round(cssHeight * finalScale);
        root.Graphics.scale = 1 / finalScale;
        
        nonResponsive = [];

        if (root.SceneManager._scene) {
            if (root.SceneManager._scene.layout()) {
                if (debugLogMessages) {
                    console.warn("The current scene " + root.SceneManager._scene.constructor.name + " does not have a .layout method; the game will not render properly until the next scene transition.");
                }
            } else {
                root.SceneManager._scene.layout();

                if (nonResponsive.length > 0 && debugLogMessages) {
                    console.warn("Classes " + nonResponsive.join(", ") + " do not have a .layout method; some portions of the current scene may not render properly until the next scene transition.");
                }
            }
        }
    }
    
    /* Monkey-patch the Scene Manager to fill the screen.
     */
    root.SceneManager.initGraphics = function () {
        _SceneManager_initGraphics.apply(this);
        
        adapt_to_viewport();
    };
    
    window.addEventListener("resize", adapt_to_viewport);
    
    function layout_all(children) {
        var i;
        
        for (i = 0; i < children.length; i += 1) {
            if (children[i].layout) {
                children[i].layout();
            } else {
                if (nonResponsive.indexOf(children[1].constructor.name) === -1) {
                    nonResponsive.push(children[1].constructor.name);
                }
            }
        }
    }
    
    module.layout_all = layout_all;
    module.force_frame_adaptive = force_frame_adaptive;
    
    module.updateFrameCap = updateFrameCap;
    
    module.status = "loaded";
    module.version = "0.2.0";
}(this, this.SixLoves_Responsive));
