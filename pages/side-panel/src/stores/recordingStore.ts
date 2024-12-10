import type { RecordingStatus } from '../types';

class RecordingStore {
  private _status: RecordingStatus = 'inactive';
  private _listeners: Set<(status: RecordingStatus) => void> = new Set();

  get status(): RecordingStatus {
    return this._status;
  }

  setStatus(status: RecordingStatus) {
    console.log('[Store] Setting recording status:', status);
    this._status = status;
    this.notifyListeners();
  }

  subscribe(listener: (status: RecordingStatus) => void) {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  private notifyListeners() {
    this._listeners.forEach(listener => listener(this._status));
  }
}

export const recordingStore = new RecordingStore();
