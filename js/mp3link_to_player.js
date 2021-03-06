(function($, $SimpleMP3Player){

	if($SimpleMP3Player === void 0) {
		return;
	}


	var MSE = $SimpleMP3Player.MSE;
	var SimpleHLS = $SimpleMP3Player.SimpleHLS;
	var PlayerManager = $SimpleMP3Player.PlayerManager;
	var PlayerObserver = $SimpleMP3Player.PlayerObserver;
	var SimplePlayerObserver = PlayerObserver.SimplePlayerObserver;
	var convertURL2URI = $SimpleMP3Player.convertURL2URI;
	var _MediaSession = typeof navigator !== "undefined" && "mediaSession" in navigator && navigator.mediaSession || null;
	var SimplePlayer = function() {

		var PLAYER_ID = 0;
		var SEEK_TIME = 20;

		function SimplePlayer(targetDOM, description, useMediaSession) {
			if(!description ||
				!(MSE.isSupported() && (description.offsetInfo || description.m3u8link) || description.filePath)
			) {
				throw new Error("No source found.");
			}

			this._targetDOM = targetDOM;
			this._id = PLAYER_ID++;
			this._audio = document.createElement('audio');
			this._description = description;
			this._MSE = null;
			this._useMediaSession = useMediaSession !== void 0 ? useMediaSession : true;
			this._mediaSessionForwardTime = SEEK_TIME;
			this._mediaSessionBackwardTime = SEEK_TIME;
			this._destruct = false;
			this._audio.preload = "metadata";
			this._audio.controls = true;
			this._audio.setAttribute('controlslist',["nodownload"]);
			this._onAudioPlayingHandler = this._onAudioPlaying.bind(this);
			this._init();
		}

		SimplePlayer.prototype._init = function() {
			var enableRealtimeStreaming = true;
			var bufferSize = 12;
			if($SimpleMP3Player && $SimpleMP3Player.config) {
				var config = $SimpleMP3Player.config;
				var enableRealtimeStreaming = config.use_mp3_realtime_streaming;
				var bufferSize = config.mp3_realtime_buffer_size;
				if(config.mediaSessionForwardTime !== void 0) {
					this._mediaSessionForwardTime = config.mediaSessionForwardTime;
				}
				if(config.mediaSessionBackwardTime !== void 0) {
					this._mediaSessionBackwardTime = config.mediaSessionBackwardTime;
				}
			}

			this._targetDOM.parentNode.replaceChild(this._audio, this._targetDOM);
			if(enableRealtimeStreaming && MSE.isSupported()) {
				this._MSE = this._description.m3u8link ?
					new SimpleHLS(this._audio, this._description.m3u8link, this._description.file_srl, bufferSize) :
					new MSE(this._audio, this._description.offsetInfo, {
						mp3url: this._description.filePath,
						file_srl: this._description.file_srl,
						bufferSize: bufferSize
					});

				this._MSE.provideCacheManager($SimpleMP3Player.MemoryCacheManager);
			} else {
				this._audio.src = this._description.filePath;
				this._audio.load();
			}
			this._audio.addEventListener('playing', this._onAudioPlayingHandler, false);
		};

		SimplePlayer.prototype._updateMediaSessionMetadata = function() {
			if(_MediaSession) {
				if(this._description.tags !== void 0) {
					var config = $SimpleMP3Player.config;
					var defaultCover = config.default_cover;
					var useThumbnail = config.use_thumbnail;
					if(defaultCover) {
						defaultCover = $SimpleMP3Player.convertURL2URI(defaultCover);
					}
					var tags = this._description.tags;
					var albumArt = tags.albumArt;
					if(!albumArt) {
						if(useThumbnail && this._description.thumbnail) {
							albumArt = this._description.thumbnail;
						} else if(defaultCover) {
							albumArt = defaultCover;
						}
					}

					_MediaSession.metadata = new window.MediaMetadata({
						title: tags.title ? tags.title : void 0,
						artist: tags.artist ? tags.artist : void 0,
						album: tags.album ? tags.album : void 0,
						artwork: albumArt ? [{src : albumArt}] : void 0
					});
				} else {
					_MediaSession.metadata = void 0;
				}
			}
		};

		SimplePlayer.prototype._registerMediaSessionHandlers = function() {
			if(_MediaSession) {
				var that = this;
				_MediaSession.setActionHandler("play", function() {
					that._audio.play();
				});

				_MediaSession.setActionHandler("pause", function() {
					that._audio.pause();
				});

				_MediaSession.setActionHandler("seekbackward", function() {
					that._audio.currentTime = Math.max(0, that._audio.currentTime - that._mediaSessionBackwardTime);
				});

				_MediaSession.setActionHandler("seekforward", function() {
					that._audio.currentTime = Math.min(that._audio.duration || 0, that._audio.currentTime + that._mediaSessionForwardTime);
				});

				_MediaSession.setActionHandler("previoustrack", null);

				_MediaSession.setActionHandler("nexttrack", null);
			}
		};

		SimplePlayer.prototype._onAudioPlaying = function() {
			if(this._useMediaSession) {
				this._updateMediaSessionMetadata();
				this._registerMediaSessionHandlers();
			}
		};

		SimplePlayer.prototype.getAudioNode = function() {
			return this._audio;
		};

		SimplePlayer.prototype.destruct = function() {
			if(!this._destruct) {
				this._audio.removeEventListener('playing', this._onAudioPlayingHandler, false);
				if(this._playingObserverTimerID !== null) {
					window.clearTimeout(this._playingObserverTimerID);
					this._playingObserverTimerID = null;
				}

				if(this._MSE) {
					this._MSE.destruct();
				}
			}
		};

		return SimplePlayer;
	}();

	function isPlayableLink(link) {
		if(link) {
			link = link.toLowerCase();
			return !!(link.indexOf('.mp3') > -1 || link.indexOf('.m4a') > -1 || link.indexOf('.ogg') > -1);
		}

		return false;
	}

	$(document).ready(function(){
		var onDescriptionLoad = function(data){
			if(subscriber) {
				subscriber.remove();
				subscriber = null;
			}
			if(data && data.length) {
				$('.xe_content a').each(function() {
				    var that = this;
					var $this = $(this);
					var href = $this.attr('href');
					var data_file_srl = $this.attr('data-file-srl') || null;
					var file_srl = data_file_srl ? parseInt(data_file_srl, 10) : NaN;
					if(isPlayableLink(href)) {
                        var findDescription = data.find(function(data) {
                        	var description = data.description;
                        	var uploaded_filename = description && description.uploaded_filename ? description.uploaded_filename.replace(/^.\/files/i, '/files') : null;
                            return (file_srl && !isNaN(file_srl) && description.file_srl === file_srl) || (uploaded_filename && href && href.indexOf(uploaded_filename) > -1);
                        });
                        if(findDescription) {
                        	var useMediaSession = !!($SimpleMP3Player.config && $SimpleMP3Player.config.use_mediasession);
                        	var player = new SimplePlayer(that, findDescription.description, useMediaSession);
							PlayerManager.registerPlayer(new SimplePlayerObserver(player));
                        }
					}
				});
			}
		};
		var subscriber = null;
		if($SimpleMP3Player.audioDescriptions && $SimpleMP3Player.audioDescriptions.length > 0) {
			onDescriptionLoad($SimpleMP3Player.audioDescriptions);
		} else {
			subscriber = $SimpleMP3Player.onAudioDescriptionLoad.subscribe(onDescriptionLoad);
		}
	});

})(window.jQuery, window.$SimpleMP3Player);
