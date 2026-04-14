// Web Bluetooth API Type Definitions (Shared)

export interface BluetoothRequestDeviceOptions {
  acceptAllDevices?: boolean;
  filters?: BluetoothLEScanFilter[];
  optionalServices?: string[];
}

export interface BluetoothLEScanFilter {
  services?: string[];
  name?: string;
  namePrefix?: string;
}

export interface BluetoothRemoteGATTServer {
  readonly device: BluetoothDevice;
  readonly connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: string | number): Promise<BluetoothRemoteGATTService>;
  getPrimaryServices(service?: string | number): Promise<BluetoothRemoteGATTService[]>;
}

export interface BluetoothRemoteGATTService {
  readonly device: BluetoothDevice;
  readonly uuid: string;
  readonly isPrimary: boolean;
}

export interface BluetoothDevice {
  id: string;
  name: string | null;
  gatt?: BluetoothRemoteGATTServer;
}

export interface Bluetooth {
  getAvailability(): Promise<boolean>;
  getDevices(): Promise<BluetoothDevice[]>;
  requestDevice(options: BluetoothRequestDeviceOptions): Promise<BluetoothDevice>;
}

declare global {
  interface Navigator {
    bluetooth?: Bluetooth;
  }
}

export {};
