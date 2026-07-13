export type AdapterStatus = "ok" | "unsupported" | "parse-error" | "error";

export type FindingSeverity =
  | "ok"
  | "info"
  | "opportunity"
  | "warning"
  | "critical"
  | "unsupported";

export type HostProfile = "auto" | "pi-usb-flash" | "usb-ssd";

export interface SourceRecord {
  id: string;
  kind: "command" | "file" | "derived";
  status: AdapterStatus;
  command?: string;
  path?: string;
  exitCode?: number | null;
  message?: string;
}

export interface HostSummary {
  osName?: string;
  osVersion?: string;
  osId?: string;
  kernelName?: string;
  kernelRelease?: string;
  architecture?: string;
  hostname?: string;
}

export interface ToolAvailability {
  name: string;
  command: string;
  packageName?: string;
  installed: boolean;
  path?: string;
  packageAvailable?: boolean;
  candidateVersion?: string;
  installHint?: string;
  status: "available" | "missing" | "unknown";
}

export interface BlockDevice {
  name: string;
  kernelName?: string;
  parentKernelName?: string;
  type?: string;
  sizeBytes?: number;
  model?: string;
  vendor?: string;
  transport?: string;
  removable?: boolean;
  rotational?: boolean;
  mountpoints: string[];
  filesystemType?: string;
  filesystemVersion?: string;
  label?: string;
  uuid?: string;
  partuuid?: string;
  discardGranularityBytes?: number;
  discardMaxBytes?: number;
  discardZeroesData?: boolean;
}

export interface MountInfo {
  target: string;
  source?: string;
  filesystemType?: string;
  options: string[];
  sizeBytes?: number;
  usedBytes?: number;
  availableBytes?: number;
  usePercent?: number;
}

export interface DiskUsage {
  target: string;
  source?: string;
  filesystemType?: string;
  sizeBytes?: number;
  usedBytes?: number;
  availableBytes?: number;
  usePercent?: number;
}

export interface DirectoryUsage {
  path: string;
  sizeBytes?: number;
  status: AdapterStatus;
  message?: string;
}

export interface FstrimTimerState {
  unit: "fstrim.timer";
  loadState?: string;
  unitFileState?: string;
  activeState?: string;
  lastTrigger?: string;
  nextTrigger?: string;
  status: AdapterStatus;
}

export interface FstrimDryRunEntry {
  target: string;
  bytes?: number;
  device?: string;
  rawSummary: string;
}

export interface TrimSummary {
  timer: FstrimTimerState;
  advertisedDiscard: "supported" | "not-advertised" | "unknown";
  dryRun: {
    status: AdapterStatus;
    entries: FstrimDryRunEntry[];
    message?: string;
  };
}

export interface JournaldReport {
  storageMode: string;
  persistentDirectoryPresent: boolean;
  diskUsageBytes?: number;
  status: AdapterStatus;
  message?: string;
}

export interface SwapDevice {
  name: string;
  type?: string;
  sizeBytes?: number;
  usedBytes?: number;
  priority?: number;
}

export interface ZramDevice {
  name: string;
  diskSizeBytes?: number;
  dataBytes?: number;
  compressedBytes?: number;
  algorithm?: string;
}

export interface SwapReport {
  devices: SwapDevice[];
  diskBackedSwapActive: boolean;
  zramDevices: ZramDevice[];
  zswapEnabled?: boolean;
  swappiness?: number;
  status: AdapterStatus;
  message?: string;
}

export interface Finding {
  id: string;
  severity: FindingSeverity;
  title: string;
  summary: string;
  evidence?: Record<string, unknown>;
  recommendation?: string;
}

export interface DriveHealthReport {
  schemaVersion: "drive-health.report.v1";
  generatedAt: string;
  target: string;
  profile: HostProfile;
  redaction: {
    identifiersIncluded: boolean;
    redacted: boolean;
    rules: string[];
  };
  host: HostSummary;
  tools: ToolAvailability[];
  blockDevices: BlockDevice[];
  filesystems: MountInfo[];
  diskUsage: DiskUsage[];
  directoryUsage: DirectoryUsage[];
  trim: TrimSummary;
  journald: JournaldReport;
  swap: SwapReport;
  findings: Finding[];
  sources: SourceRecord[];
}

