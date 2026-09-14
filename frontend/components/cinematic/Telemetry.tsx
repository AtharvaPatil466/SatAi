"use client";

export function Telemetry() {
  return (
    <div className="cinematic-telemetry" aria-hidden="true">
      <div className="telemetry-arrival">
        <span className="telemetry-pulse" />
        <p>OPTICAL SENSOR ONLINE</p>
        <p>GROUND TRACK ACQUIRED</p>
      </div>
      <div className="telemetry-lock">
        <span>ORBITAL LOCK</span>
        <span className="telemetry-rule" />
        <span>COORDS NOT RECORDED</span>
      </div>
      <div className="descent-readout">
        <span>APPROACH VECTOR</span>
        <strong>EARTH OBSERVATION</strong>
      </div>
    </div>
  );
}
