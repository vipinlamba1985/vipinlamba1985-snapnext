package __APP_PACKAGE__;

import android.content.Context;

import androidx.fragment.app.FragmentActivity;
import androidx.mediarouter.app.MediaRouteChooserDialogFragment;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.cast.MediaInfo;
import com.google.android.gms.cast.MediaLoadRequestData;
import com.google.android.gms.cast.MediaMetadata;
import com.google.android.gms.cast.MediaStatus;
import com.google.android.gms.cast.framework.CastContext;
import com.google.android.gms.cast.framework.CastSession;
import com.google.android.gms.cast.framework.media.RemoteMediaClient;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;

/**
 * Small Capacitor bridge over the official Google Cast sender framework.
 *
 * The WebView never hands its login token to the Cast device. It loads only the
 * temporary, per-session HTTPS media URLs issued by SnapNext's family-watch API.
 */
@CapacitorPlugin(name = "FamilyCast")
public class FamilyCastPlugin extends Plugin {
    private static final String FRAMEWORK_VERSION = "google-cast-framework-22.3.1";
    private RemoteMediaClient observedClient;
    private String currentKind = "";
    private boolean sentEndedForCurrentItem = false;

    private final RemoteMediaClient.Callback mediaCallback = new RemoteMediaClient.Callback() {
        @Override
        public void onStatusUpdated() {
            if (observedClient == null || !"video".equals(currentKind)) return;
            MediaStatus status = observedClient.getMediaStatus();
            if (status == null) return;
            boolean ended = status.getPlayerState() == MediaStatus.PLAYER_STATE_IDLE
                && status.getIdleReason() == MediaStatus.IDLE_REASON_FINISHED;
            if (ended && !sentEndedForCurrentItem) {
                sentEndedForCurrentItem = true;
                JSObject payload = new JSObject();
                payload.put("reason", "finished");
                payload.put("transport", "google-cast");
                notifyListeners("ended", payload);
            }
        }
    };

    @PluginMethod
    public void getCapability(PluginCall call) {
        Context context = getContext();
        int availability = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context);
        JSObject result = new JSObject();
        result.put("supported", availability == ConnectionResult.SUCCESS);
        result.put("platform", "android");
        result.put("transport", "google-cast");
        result.put("supportsPhotos", true);
        result.put("supportsVideos", true);
        result.put("fullStory", true);
        result.put("frameworkVersion", FRAMEWORK_VERSION);
        if (availability != ConnectionResult.SUCCESS) result.put("reason", "google_play_services_unavailable");
        call.resolve(result);
    }

    @PluginMethod
    public void presentRoutePicker(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                CastContext castContext = CastContext.getSharedInstance(getContext());
                FragmentActivity activity = (FragmentActivity) getActivity();
                MediaRouteChooserDialogFragment chooser = new MediaRouteChooserDialogFragment();
                chooser.setRouteSelector(castContext.getMergedSelector());
                chooser.show(activity.getSupportFragmentManager(), "snapnext-family-cast-routes");
                JSObject result = new JSObject();
                result.put("presented", true);
                result.put("transport", "google-cast");
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Google Cast device picker is unavailable.", error);
            }
        });
    }

    @PluginMethod
    public void getState(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            JSObject result = new JSObject();
            result.put("platform", "android");
            result.put("transport", "google-cast");
            try {
                CastSession session = CastContext.getSharedInstance(getContext()).getSessionManager().getCurrentCastSession();
                boolean connected = session != null && session.isConnected();
                result.put("connected", connected);
                if (connected && session.getCastDevice() != null) {
                    result.put("deviceName", session.getCastDevice().getFriendlyName());
                }
            } catch (Exception error) {
                result.put("connected", false);
            }
            call.resolve(result);
        });
    }

    @PluginMethod
    public void loadMedia(PluginCall call) {
        String url = call.getString("url");
        String mime = call.getString("mime");
        String title = call.getString("title");
        String kind = call.getString("kind");
        Boolean autoplayValue = call.getBoolean("autoplay");
        boolean autoplay = autoplayValue == null || autoplayValue;
        if (url == null || !url.startsWith("https://")) {
            call.reject("Google Cast requires a temporary HTTPS media URL.");
            return;
        }
        if (!"photo".equals(kind) && !"video".equals(kind)) {
            call.reject("Only family photos and videos can be cast.");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                RemoteMediaClient remote = remoteClient();
                if (remote == null) {
                    call.reject("Choose a Cast device first.");
                    return;
                }
                observe(remote);
                currentKind = kind;
                sentEndedForCurrentItem = false;

                int metadataType = "photo".equals(kind)
                    ? MediaMetadata.MEDIA_TYPE_PHOTO
                    : MediaMetadata.MEDIA_TYPE_MOVIE;
                MediaMetadata metadata = new MediaMetadata(metadataType);
                metadata.putString(MediaMetadata.KEY_TITLE, title == null ? "Family memory" : title);

                MediaInfo mediaInfo = new MediaInfo.Builder(url)
                    .setStreamType(MediaInfo.STREAM_TYPE_BUFFERED)
                    .setContentType(mime == null || mime.isEmpty() ? ("video".equals(kind) ? "video/mp4" : "image/jpeg") : mime)
                    .setMetadata(metadata)
                    .build();
                MediaLoadRequestData request = new MediaLoadRequestData.Builder()
                    .setMediaInfo(mediaInfo)
                    .setAutoplay(autoplay)
                    .build();
                remote.load(request);

                JSObject result = new JSObject();
                result.put("ok", true);
                result.put("transport", "google-cast");
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Could not load this family memory on the Cast device.", error);
            }
        });
    }

    @PluginMethod
    public void play(PluginCall call) {
        control(call, "play");
    }

    @PluginMethod
    public void pause(PluginCall call) {
        control(call, "pause");
    }

    @PluginMethod
    public void stop(PluginCall call) {
        control(call, "stop");
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                if (observedClient != null) {
                    observedClient.unregisterCallback(mediaCallback);
                    observedClient = null;
                }
                CastContext.getSharedInstance(getContext()).getSessionManager().endCurrentSession(true);
                currentKind = "";
                sentEndedForCurrentItem = false;
                JSObject result = new JSObject();
                result.put("ok", true);
                result.put("transport", "google-cast");
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Could not disconnect the Cast session.", error);
            }
        });
    }

    private void control(PluginCall call, String action) {
        getActivity().runOnUiThread(() -> {
            try {
                RemoteMediaClient remote = remoteClient();
                if (remote == null) {
                    call.reject("No Cast device is connected.");
                    return;
                }
                observe(remote);
                if ("play".equals(action)) remote.play();
                else if ("pause".equals(action)) remote.pause();
                else remote.stop();
                JSObject result = new JSObject();
                result.put("ok", true);
                result.put("transport", "google-cast");
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Could not update Cast playback.", error);
            }
        });
    }

    private RemoteMediaClient remoteClient() {
        CastSession session = CastContext.getSharedInstance(getContext()).getSessionManager().getCurrentCastSession();
        return session != null && session.isConnected() ? session.getRemoteMediaClient() : null;
    }

    private void observe(RemoteMediaClient remote) {
        if (observedClient == remote) return;
        if (observedClient != null) observedClient.unregisterCallback(mediaCallback);
        observedClient = remote;
        observedClient.registerCallback(mediaCallback);
    }
}
