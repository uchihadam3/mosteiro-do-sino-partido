import React from 'react';
import { useSettings } from '../app/hooks';
import { setSettings, type Settings } from '../state/settings';
import { canInstall, isStandalone, promptInstall } from '../pwa/register';

export function SettingsModal({ onClose }: { onClose(): void }) {
  const s = useSettings();
  const slider = (k: keyof Settings, label: string) => (
    <label className="field">
      <span>
        {label} <span className="muted">{Math.round((s[k] as number) * 100)}%</span>
      </span>
      <input type="range" min={0} max={1} step={0.05} value={s[k] as number} onChange={(e) => setSettings({ [k]: Number(e.target.value) } as Partial<Settings>)} />
    </label>
  );
  const seg = <T extends string | number>(k: keyof Settings, label: string, opts: [T, string][]) => (
    <div className="field">
      <span>{label}</span>
      <div className="seg">
        {opts.map(([v, l]) => (
          <button key={String(v)} className={s[k] === v ? 'on' : ''} onClick={() => setSettings({ [k]: v } as Partial<Settings>)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
  const toggle = (k: keyof Settings, label: string, hint?: string) => (
    <div className="field">
      <span>
        {label} {hint && <span className="xs muted">· {hint}</span>}
      </span>
      <div className="seg">
        <button className={!s[k] ? 'on' : ''} onClick={() => setSettings({ [k]: false } as Partial<Settings>)}>
          Não
        </button>
        <button className={s[k] ? 'on' : ''} onClick={() => setSettings({ [k]: true } as Partial<Settings>)}>
          Sim
        </button>
      </div>
    </div>
  );
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal panel ornate" style={{ width: 'min(760px, 96vw)' }} onClick={(e) => e.stopPropagation()}>
        <h2 className="h2">Configurações</h2>
        <div className="divider" />
        <div className="body">
          <div className="settings-grid">
            {slider('master', 'Volume geral')}
            {slider('music', 'Música')}
            {slider('sfx', 'Efeitos')}
            {slider('ambience', 'Ambiência')}
            {toggle('muted', 'Silenciar tudo')}
            {toggle('subtitles', 'Legendas de áudio')}
            {seg('quality', 'Qualidade gráfica', [['auto', 'Auto'], ['low', 'Baixa'], ['medium', 'Média'], ['high', 'Alta']])}
            {seg('animSpeed', 'Velocidade das animações', [[1, '1×'], [1.5, '1,5×'], [2, '2×'], [3, '3×']])}
            {seg('uiScale', 'Escala da interface', [[0.85, 'P'], [1, 'M'], [1.15, 'G'], [1.3, 'GG']])}
            {toggle('reducedMotion', 'Reduzir movimento')}
            {toggle('highContrast', 'Alto contraste')}
            {toggle('autoTieBreak', 'Desempate automático', 'empates do Alvo Padrão sem perguntar')}
            {toggle('showPerf', 'Painel de desempenho', 'FPS, draw calls')}
          </div>
          {canInstall() && !isStandalone() && (
            <div className="row" style={{ marginTop: 16 }}>
              <button className="btn" onClick={() => void promptInstall()}>
                Instalar o jogo neste dispositivo
              </button>
              <span className="xs muted">Funciona offline e se atualiza sozinho.</span>
            </div>
          )}
        </div>
        <div className="actions">
          <button className="btn primary" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
