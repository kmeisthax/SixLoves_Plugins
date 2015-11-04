/*jslint nomen:false*/

/*:
 * @author David Wendt (fantranslation.org)
 * @plugindesc Makes your game responsive. v0.1.0
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
 * @help
 * 
 *      Adjusts your game's playfield to fit the screen viewport it has, such
 * that the game in question has no letterboxing bars and the scale of rendered
 * art assets corresponds to some physical quantity.
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
 */

(function (root) {
    "use strict";
    
    var parameters = root.PluginManager.parameters('SixLoves_Responsive'),
        artScale = Number(parameters.ArtScale || 1.5),
        minWidth = Number(parameters.MinWidth || 544),
        minHeight = Number(parameters.MinHeight || 416),
        maxWidth = Number(parameters.MaxWidth || 816),
        maxHeight = Number(parameters.MaxHeight || 624),
        
        /* Preceding implementations of patched code. */
        _SceneManager_initGraphics = root.SceneManager.initGraphics,
        _Graphics_centerElement = root.Graphics._centerElement;
    
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
        
        console.log(window.innerWidth);
        console.log(window.innerHeight);
        console.log(artScale);
        console.log(finalScale);
        
        root.Graphics.width = cssWidth * finalScale;
        root.Graphics.height = cssHeight * finalScale;
        root.Graphics.boxWidth = cssWidth * finalScale;
        root.Graphics.boxHeight = cssHeight * finalScale;
        root.Graphics.scale = 1 / finalScale;
        
        if (root.SceneManager._scene) {
            root.SceneManager._scene.layout();
        }
    }
    
    /* Monkey-patch the Scene Manager to fill the screen.
     */
    root.SceneManager.initGraphics = function () {
        _SceneManager_initGraphics.apply(this);
        
        adapt_to_viewport();
    };
    
    window.addEventListener("resize", adapt_to_viewport);
    
    function layoutAll(children) {
        var i;
        
        for (i = 0; i < children.length; i += 1) {
            if (children[i].layout) {
                children[i].layout();
            }
        }
    }
    
    /* == GENERIC IMPLEMENTATIONS == */
    
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
        
        layoutAll(this.children);
    };
    
    /* Add the layout method to the WindowLayer implementation.
     * 
     * Triggering layout on a WindowLayer just lays out all children.
     */
    root.WindowLayer.prototype.layout = function () {
        layoutAll(this.children);
    }
    
    /* Same for sprites, too.
     */
    root.Sprite.prototype.layout = function () {
        layoutAll(this.children);
    }

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

        layoutAll(this.children);
    }

    /* Ensure screen-filling sprites actually, y'know, fill the screen.
     */
    root.ScreenSprite.prototype.layout = function () {
        this.scale.x = Graphics.width;
        this.scale.y = Graphics.height;

        layoutAll(this.children);
    }
    
    /* == SPECIAL-PURPOSE IMPLEMENTATIONS: TITLE SCREEN == */
    
    /* Recenter the background when a layout is triggered.  
     */
    root.Scene_Title.prototype.layout = function () {
        this.centerSprite(this._backSprite1);
        this.centerSprite(this._backSprite2);
        
        this.removeChild(this._gameTitleSprite);
        this.createForeground();
        
        root.Scene_Base.prototype.layout.call(this);
    }
    
    root.Scene_Title.prototype.centerSprite = (function (old_impl) {
        return function (sprite) {
            var fillingScale;
            
            console.log(sprite.bitmap.width);
            console.log(sprite.bitmap.height);

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
    }

    /* == SPECIAL-PURPOSE IMPLEMENTATIONS: MAP SCREEN == */

    /* Resize objects managed by the spriteset management code.
     */
    root.Spriteset_Base.prototype.layout = function () {
        var width = Graphics.boxWidth,
            height = Graphics.boxHeight,
            x = (Graphics.width - width) / 2,
            y = (Graphics.height - height) / 2;

        this.setFrame(0, 0, Graphics.width, Graphics.height);
        this._pictureContainer.setFrame(x, y, width, height);
        this._baseSprite.setFrame(0, 0, width, height);

        root.Sprite.prototype.layout.call(this);
    }

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
    }
}(this));
