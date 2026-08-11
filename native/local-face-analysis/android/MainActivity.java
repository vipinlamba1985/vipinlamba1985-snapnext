package __APP_PACKAGE__;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.util.Base64;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.face.FaceDetection;
import com.google.mlkit.vision.face.FaceDetector;
import com.google.mlkit.vision.face.FaceDetectorOptions;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocalFaceAnalysisPlugin.class);
        super.onCreate(savedInstanceState);
    }

    /**
     * Count-only local detector used by SnapNext's 0 / 1-4 / 5+ cloud gate.
     *
     * It never returns face boxes, crops, embeddings, tracking ids or identity
     * labels. The pixels arrive from the already user-selected WebView File as a
     * bounded in-memory JPEG and never leave this process.
     */
    @CapacitorPlugin(name = "LocalFaceAnalysis")
    public static class LocalFaceAnalysisPlugin extends Plugin {
        private static final String MODEL_VERSION = "mlkit-face-detection-16.1.7-bundled";
        private static final int MAX_DATA_URL_CHARS = 16_000_000;

        @PluginMethod
        public void getCapability(PluginCall call) {
            JSObject result = new JSObject();
            result.put("supported", true);
            result.put("platform", "android");
            result.put("modelVersion", MODEL_VERSION);
            call.resolve(result);
        }

        @PluginMethod
        public void detectFaceCount(PluginCall call) {
            String dataUrl = call.getString("dataUrl");
            if (dataUrl == null || dataUrl.length() > MAX_DATA_URL_CHARS) {
                call.reject("A bounded image dataUrl is required for local face analysis.");
                return;
            }
            int comma = dataUrl.indexOf(',');
            if (comma < 0 || comma + 1 >= dataUrl.length()) {
                call.reject("Invalid image dataUrl.");
                return;
            }

            final byte[] bytes;
            try {
                bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
            } catch (IllegalArgumentException error) {
                call.reject("Invalid image payload.");
                return;
            }

            Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bitmap == null) {
                call.reject("Could not decode image for local face analysis.");
                return;
            }

            FaceDetectorOptions options = new FaceDetectorOptions.Builder()
                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
                .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_NONE)
                .setContourMode(FaceDetectorOptions.CONTOUR_MODE_NONE)
                .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_NONE)
                .setMinFaceSize(0.05f)
                .build();
            FaceDetector detector = FaceDetection.getClient(options);
            InputImage image = InputImage.fromBitmap(bitmap, 0);

            detector.process(image)
                .addOnSuccessListener(faces -> {
                    JSObject result = new JSObject();
                    result.put("faceCount", faces.size());
                    // ML Kit does not expose a per-face detection probability.
                    // Keep this field conservative; eligibility uses faceCount.
                    result.put("faceDetectionConfidence", 0.0);
                    result.put("platform", "android");
                    result.put("modelVersion", MODEL_VERSION);
                    call.resolve(result);
                    detector.close();
                    bitmap.recycle();
                })
                .addOnFailureListener(error -> {
                    detector.close();
                    bitmap.recycle();
                    call.reject("Android local face detection failed.", error);
                });
        }
    }
}
