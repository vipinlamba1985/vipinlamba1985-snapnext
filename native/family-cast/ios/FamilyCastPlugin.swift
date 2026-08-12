@objc(FamilyCast)
class FamilyCastPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "FamilyCast"
    let jsName = "FamilyCast"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getCapability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentRoutePicker", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "loadMedia", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise)
    ]

    private let frameworkVersion = "apple-avkit-airplay-ios15+"
    private var player: AVPlayer?
    private var endedObserver: NSObjectProtocol?
    private var pickerOverlay: UIView?

    @objc func getCapability(_ call: CAPPluginCall) {
        call.resolve([
            "supported": true,
            "platform": "ios",
            "transport": "airplay",
            "supportsPhotos": false,
            "supportsVideos": true,
            "fullStory": false,
            "frameworkVersion": frameworkVersion
        ])
    }

    @objc func presentRoutePicker(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self,
                  let rootView = self.bridge?.viewController?.view else {
                call.reject("AirPlay route picker is unavailable.")
                return
            }

            self.dismissPickerOverlay()
            let overlay = UIView(frame: rootView.bounds)
            overlay.translatesAutoresizingMaskIntoConstraints = false
            overlay.backgroundColor = UIColor.black.withAlphaComponent(0.82)
            overlay.accessibilityViewIsModal = true

            let card = UIView()
            card.translatesAutoresizingMaskIntoConstraints = false
            card.backgroundColor = UIColor(white: 0.10, alpha: 1)
            card.layer.cornerRadius = 24

            let title = UILabel()
            title.translatesAutoresizingMaskIntoConstraints = false
            title.text = "Choose an AirPlay TV"
            title.textColor = .white
            title.font = .systemFont(ofSize: 22, weight: .bold)
            title.textAlignment = .center

            let detail = UILabel()
            detail.translatesAutoresizingMaskIntoConstraints = false
            detail.text = "Tap the AirPlay button below, choose your TV, then return to SnapNext."
            detail.textColor = UIColor.white.withAlphaComponent(0.65)
            detail.font = .systemFont(ofSize: 14, weight: .medium)
            detail.textAlignment = .center
            detail.numberOfLines = 0

            let routePicker = AVRoutePickerView(frame: .zero)
            routePicker.translatesAutoresizingMaskIntoConstraints = false
            routePicker.prioritizesVideoDevices = true
            routePicker.tintColor = .white
            routePicker.activeTintColor = UIColor.systemPink

            let done = UIButton(type: .system)
            done.translatesAutoresizingMaskIntoConstraints = false
            done.setTitle("Done", for: .normal)
            done.setTitleColor(.black, for: .normal)
            done.titleLabel?.font = .systemFont(ofSize: 17, weight: .bold)
            done.backgroundColor = .white
            done.layer.cornerRadius = 22
            done.addTarget(self, action: #selector(self.dismissPickerOverlay), for: .touchUpInside)

            rootView.addSubview(overlay)
            overlay.addSubview(card)
            card.addSubview(title)
            card.addSubview(detail)
            card.addSubview(routePicker)
            card.addSubview(done)

            NSLayoutConstraint.activate([
                overlay.leadingAnchor.constraint(equalTo: rootView.leadingAnchor),
                overlay.trailingAnchor.constraint(equalTo: rootView.trailingAnchor),
                overlay.topAnchor.constraint(equalTo: rootView.topAnchor),
                overlay.bottomAnchor.constraint(equalTo: rootView.bottomAnchor),

                card.leadingAnchor.constraint(greaterThanOrEqualTo: overlay.leadingAnchor, constant: 24),
                card.trailingAnchor.constraint(lessThanOrEqualTo: overlay.trailingAnchor, constant: -24),
                card.centerXAnchor.constraint(equalTo: overlay.centerXAnchor),
                card.centerYAnchor.constraint(equalTo: overlay.centerYAnchor),
                card.widthAnchor.constraint(lessThanOrEqualToConstant: 420),

                title.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 24),
                title.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -24),
                title.topAnchor.constraint(equalTo: card.topAnchor, constant: 28),

                detail.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 28),
                detail.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -28),
                detail.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 12),

                routePicker.centerXAnchor.constraint(equalTo: card.centerXAnchor),
                routePicker.topAnchor.constraint(equalTo: detail.bottomAnchor, constant: 28),
                routePicker.widthAnchor.constraint(equalToConstant: 72),
                routePicker.heightAnchor.constraint(equalToConstant: 72),

                done.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 24),
                done.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -24),
                done.topAnchor.constraint(equalTo: routePicker.bottomAnchor, constant: 28),
                done.heightAnchor.constraint(equalToConstant: 46),
                done.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -24)
            ])

            self.pickerOverlay = overlay
            call.resolve([
                "presented": true,
                "platform": "ios",
                "transport": "airplay"
            ])
        }
    }

    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            let connected = self?.player?.isExternalPlaybackActive == true
            call.resolve([
                "connected": connected,
                "externalPlaybackActive": connected,
                "platform": "ios",
                "transport": "airplay",
                "deviceName": connected ? "AirPlay" : ""
            ])
        }
    }

    @objc func loadMedia(_ call: CAPPluginCall) {
        guard let rawURL = call.getString("url"),
              let url = URL(string: rawURL),
              url.scheme?.lowercased() == "https" else {
            call.reject("AirPlay requires a temporary HTTPS video URL.")
            return
        }
        guard call.getString("kind") == "video" else {
            call.reject("AirPlay direct playback supports video memories. Use Watch together for mixed photo/video stories.")
            return
        }
        let autoplay = call.getBool("autoplay") ?? true

        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.removeEndedObserver()
            let item = AVPlayerItem(url: url)
            let player = AVPlayer(playerItem: item)
            player.allowsExternalPlayback = true
            player.usesExternalPlaybackWhileExternalScreenIsActive = true
            player.externalPlaybackVideoGravity = .resizeAspect
            self.player = player
            self.endedObserver = NotificationCenter.default.addObserver(
                forName: AVPlayerItem.didPlayToEndTimeNotification,
                object: item,
                queue: .main
            ) { [weak self] _ in
                self?.notifyListeners("ended", data: [
                    "reason": "finished",
                    "transport": "airplay"
                ])
            }
            if autoplay { player.play() }
            call.resolve([
                "ok": true,
                "transport": "airplay"
            ])
        }
    }

    @objc func play(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.player?.play()
            call.resolve(["ok": true, "transport": "airplay"])
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.player?.pause()
            call.resolve(["ok": true, "transport": "airplay"])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.stopPlayback()
            call.resolve(["ok": true, "transport": "airplay"])
        }
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.stopPlayback()
            self?.dismissPickerOverlay()
            call.resolve(["ok": true, "transport": "airplay"])
        }
    }

    @objc private func dismissPickerOverlay() {
        pickerOverlay?.removeFromSuperview()
        pickerOverlay = nil
    }

    private func stopPlayback() {
        player?.pause()
        player?.replaceCurrentItem(with: nil)
        player = nil
        removeEndedObserver()
    }

    private func removeEndedObserver() {
        if let endedObserver {
            NotificationCenter.default.removeObserver(endedObserver)
            self.endedObserver = nil
        }
    }
}
