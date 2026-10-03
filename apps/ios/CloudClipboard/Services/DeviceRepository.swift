//
//  DeviceRepository.swift
//  CloudClipboard
//
//  设备注册与管理。device_type 固定 "other"，platform 固定 "ios"
//  （registerDeviceSchema 只接受 pwa | cli | extension | other）。
//

import Foundation
#if canImport(UIKit)
import UIKit
import CloudClipboardShared
#endif

@MainActor
@Observable
public final class DeviceRepository {
    public private(set) var devices: [DeviceDTO] = []
    public private(set) var isLoading = false
    public private(set) var lastError: String?

    private let apiClient: APIClientProtocol
    private let keychain: KeychainServiceProtocol
    private let settings: SharedSettings

    public init(
        apiClient: APIClientProtocol,
        keychain: KeychainServiceProtocol,
        settings: SharedSettings = SharedSettings()
    ) {
        self.apiClient = apiClient
        self.keychain = keychain
        self.settings = settings
    }

    /// 稳定设备 id：首次生成后写 Keychain（卸载重装会变，但不会与其他设备冲突）
    public var deviceId: String {
        if let existing = keychain.get(.deviceId), !existing.isEmpty { return existing }
        let generated = "ios-\(UUID().uuidString.prefix(8))"
        try? keychain.set(generated, for: .deviceId)
        return generated
    }

    /// 默认设备名：iPhone / iPad + 机型名
    public var defaultDeviceName: String {
        #if canImport(UIKit)
        let model = UIDevice.current.model
        let suffix = UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone"
        return "\(suffix) (\(model)) - App"
        #else
        return "iOS - App"
        #endif
    }

    public var deviceName: String {
        if let existing = keychain.get(.deviceName), !existing.isEmpty { return existing }
        return defaultDeviceName
    }

    public func setDeviceName(_ name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        try? keychain.set(trimmed, for: .deviceName)
    }

    /// 注册/更新当前设备（幂等 upsert）。
    /// 上传前必须调用，否则服务端 devices 表没有该设备。
    @discardableResult
    public func registerCurrentDevice() async -> Bool {
        do {
            let body = RegisterDeviceRequest(
                id: deviceId,
                name: deviceName,
                platform: "ios",
                browser: "CloudClipboard iOS \(UIDevice.current.systemName) \(UIDevice.current.systemVersion)",
                deviceType: "other"
            )
            _ = try await apiClient.send(
                Endpoints.registerDevice(body: try JSONEncoder().encode(body)),
                as: DeviceResponse.self
            )
            return true
        } catch {
            AppLog.api.info("设备注册失败: \((error as? LocalizedError)?.errorDescription ?? "未知错误", privacy: .public)")
            return false
        }
    }

    public func loadDevices() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let response = try await apiClient.send(Endpoints.listDevices(), as: DeviceListResponse.self)
            devices = response.devices
            lastError = nil
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? "无法加载设备列表"
        }
    }

    public func rename(_ id: String, to name: String) async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        do {
            let body = UpdateDeviceRequest(name: trimmed)
            _ = try await apiClient.send(
                Endpoints.updateDevice(id: id, body: try JSONEncoder().encode(body)),
                as: DeviceResponse.self
            )
            if id == deviceId { setDeviceName(trimmed) }
            await loadDevices()
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? "重命名失败"
        }
    }

    public func setBarkURL(_ id: String, barkURL: String) async {
        do {
            let body = UpdateDeviceRequest(barkUrl: barkURL.trimmingCharacters(in: .whitespacesAndNewlines))
            _ = try await apiClient.send(
                Endpoints.updateDevice(id: id, body: try JSONEncoder().encode(body)),
                as: DeviceResponse.self
            )
            await loadDevices()
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? "保存 Bark 地址失败"
        }
    }

    public func delete(_ id: String) async {
        do {
            _ = try await apiClient.send(Endpoints.deleteDevice(id: id))
            devices.removeAll { $0.id == id }
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? "删除设备失败"
        }
    }
}
