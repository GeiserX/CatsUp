// platform/macos/AudioCaptureVirtualDevice.swift
// Helper for working with virtual audio devices (e.g., BlackHole) to route/loopback app audio.
// This file provides discovery and convenience checks. Advanced tasks like creating aggregate/multi-output
// devices require CoreAudio HAL calls and elevated complexity; stubs are included for extension.
// References: BlackHole virtual device info; macOS virtual audio device patterns. 【2】【9】

import Foundation
import CoreAudio
import AudioToolbox

public final class AudioCaptureVirtualDevice {
    public struct DeviceInfo {
        public let id: AudioDeviceID
        public let uid: String
        public let name: String
        public let isInput: Bool
        public let isOutput: Bool
    }

    public init() {}

    // MARK: - Device enumeration

    public func allDevices() -> [DeviceInfo] {
        var addr = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var dataSize: UInt32 = 0
        var status = AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &dataSize)
        guard status == noErr else { return [] }
        let count = Int(dataSize) / MemoryLayout<AudioDeviceID>.size
        var deviceIDs = [AudioDeviceID](repeating: 0, count: count)
        status = AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &dataSize, &deviceIDs)
        guard status == noErr else { return [] }

        return deviceIDs.compactMap { makeInfo(for: $0) }
    }

    public func findByName(_ name: String) -> DeviceInfo? {
        return allDevices().first { $0.name.caseInsensitiveCompare(name) == .orderedSame }
    }

    public func isInstalled(name: String) -> Bool {
        return findByName(name) != nil
    }

    // MARK: - Default device helpers

    public func getDefaultOutput() -> DeviceInfo? {
        var addr = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var devID = AudioDeviceID(0)
        var size = UInt32(MemoryLayout<AudioDeviceID>.size)
        let status = AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size, &devID)
        guard status == noErr else { return nil }
        return makeInfo(for: devID)
    }

    public func setDefaultOutput(to deviceID: AudioDeviceID) throws {
        var addr = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDefaultOutputDevice,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var devID = deviceID
        let status = AudioObjectSetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, UInt32(MemoryLayout<AudioDeviceID>.size), &devID)
        if status != noErr {
            throw NSError(domain: "AudioCaptureVirtualDevice", code: Int(status), userInfo: [NSLocalizedDescriptionKey: "Failed to set default output device"])
        }
    }

    // MARK: - Stubs for advanced routing (aggregate/multi-output)

    // Creating aggregate or multi-output devices programmatically is possible via HAL APIs,
    // but non-trivial: you must build CF dictionaries describing sub-devices and clock drift compensation.
    // Provide stubs to be implemented as needed.

    public func createMultiOutputDevice(primaryName: String, mirrorName: String) throws -> String {
        // TODO: Implement creation of an aggregate/multi-output device using HAL APIs if desired.
        // For many workflows, instruct the user (or provide a helper) to create a Multi-Output Device
        // in Audio MIDI Setup that includes [Headphones/Speakers + BlackHole], then select it in-app.
        throw NSError(domain: "AudioCaptureVirtualDevice", code: -1, userInfo: [NSLocalizedDescriptionKey: "Not implemented: createMultiOutputDevice"])
    }

    // MARK: - Private

    private func makeInfo(for deviceID: AudioDeviceID) -> DeviceInfo? {
        guard deviceID != 0 else { return nil }
        let uid = getStringProperty(deviceID, kAudioDevicePropertyDeviceUID) ?? ""
        let name = getStringProperty(deviceID, kAudioObjectPropertyName) ?? "Unknown"
        let isInput = hasStream(deviceID, scope: kAudioDevicePropertyScopeInput)
        let isOutput = hasStream(deviceID, scope: kAudioDevicePropertyScopeOutput)
        return DeviceInfo(id: deviceID, uid: uid, name: name, isInput: isInput, isOutput: isOutput)
    }

    private func getStringProperty(_ deviceID: AudioDeviceID, _ selector: AudioObjectPropertySelector) -> String? {
        var addr = AudioObjectPropertyAddress(mSelector: selector, mScope: kAudioObjectPropertyScopeGlobal, mElement: kAudioObjectPropertyElementMain)
        var size: UInt32 = 0
        var status = AudioObjectGetPropertyDataSize(deviceID, &addr, 0, nil, &size)
        guard status == noErr else { return nil }
        var cfStr: CFString = "" as CFString
        status = AudioObjectGetPropertyData(deviceID, &addr, 0, nil, &size, &cfStr)
        guard status == noErr else { return nil }
        return cfStr as String
    }

    private func hasStream(_ deviceID: AudioDeviceID, scope: AudioObjectPropertyScope) -> Bool {
        var addr = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyStreams, mScope: scope, mElement: kAudioObjectPropertyElementMain)
        var size: UInt32 = 0
        let status = AudioObjectGetPropertyDataSize(deviceID, &addr, 0, nil, &size)
        if status != noErr { return false }
        return size > 0
    }
}
