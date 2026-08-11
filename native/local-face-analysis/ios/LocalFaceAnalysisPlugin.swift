@objc(LocalFaceAnalysis)
class LocalFaceAnalysisPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "LocalFaceAnalysis"
    let jsName = "LocalFaceAnalysis"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getCapability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "detectFaceCount", returnType: CAPPluginReturnPromise)
    ]

    private let modelVersion = "apple-vision-vn-face-rectangles-v1"
    private let maxDataURLCharacters = 16_000_000

    @objc func getCapability(_ call: CAPPluginCall) {
        call.resolve([
            "supported": true,
            "platform": "ios",
            "modelVersion": modelVersion
        ])
    }

    @objc func detectFaceCount(_ call: CAPPluginCall) {
        guard let dataURL = call.getString("dataUrl"), dataURL.count <= maxDataURLCharacters else {
            call.reject("A bounded image dataUrl is required for local face analysis.")
            return
        }
        guard let comma = dataURL.firstIndex(of: ",") else {
            call.reject("Invalid image dataUrl.")
            return
        }
        let encoded = String(dataURL[dataURL.index(after: comma)...])
        guard let data = Data(base64Encoded: encoded, options: .ignoreUnknownCharacters),
              let image = UIImage(data: data),
              let cgImage = image.cgImage else {
            call.reject("Could not decode image for local face analysis.")
            return
        }

        let request = VNDetectFaceRectanglesRequest()
        let handler = VNImageRequestHandler(
            cgImage: cgImage,
            orientation: exifOrientation(for: image.imageOrientation),
            options: [:]
        )

        do {
            try handler.perform([request])
            let faces = request.results ?? []
            let confidence: Double
            if faces.isEmpty {
                confidence = 0
            } else {
                let total = faces.reduce(0.0) { partial, face in
                    partial + Double(face.confidence)
                }
                confidence = max(0, min(1, total / Double(faces.count)))
            }
            call.resolve([
                "faceCount": faces.count,
                "faceDetectionConfidence": confidence,
                "platform": "ios",
                "modelVersion": modelVersion
            ])
        } catch {
            call.reject("iOS local face detection failed.", nil, error)
        }
    }

    private func exifOrientation(for orientation: UIImage.Orientation) -> CGImagePropertyOrientation {
        switch orientation {
        case .up: return .up
        case .down: return .down
        case .left: return .left
        case .right: return .right
        case .upMirrored: return .upMirrored
        case .downMirrored: return .downMirrored
        case .leftMirrored: return .leftMirrored
        case .rightMirrored: return .rightMirrored
        @unknown default: return .up
        }
    }
}
