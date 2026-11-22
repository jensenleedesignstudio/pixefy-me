import React from 'react';
import { createRoot } from 'react-dom/client';
import { ShaderGradientCanvas, ShaderGradient } from '@shadergradient/react';

class ShaderBoundary extends React.Component {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    render() { return this.state.failed ? null : this.props.children; }
}

// This React island only owns its decorative host, never the app's canvas.
export function mountShaderBackground(host) {
    const root = createRoot(host);
    root.render(
        <ShaderBoundary>
        <ShaderGradientCanvas lazyLoad={false} powerPreference="low-power" style={{ position: 'absolute', inset: 0 }}
            pixelDensity={1} fov={45}>
            <ShaderGradient control="props" type="plane" animate="on"
                color1="#fdf5ec" color2="#d7b995" color3="#b8b5a2"
                cDistance={3.6} cPolarAngle={90} cAzimuthAngle={180}
                uSpeed={0.2} uStrength={2.5} uFrequency={4}
                brightness={1.1} lightType="3d" grain="on grainBlending = {0.30}" />
        </ShaderGradientCanvas>
        </ShaderBoundary>
    );
    return () => root.unmount();
}
