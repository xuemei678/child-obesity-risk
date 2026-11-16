'use client';
import { useMemo, useState } from 'react';
import model from './model.json';
import { Activity, ChevronDown, ShieldCheck } from 'lucide-react';
type Answers = Record<string, string | number>;
const qids = model.num.filter((x: string) => x.startsWith('q'));
const clinical = model.num.filter((x: string) => !x.startsWith('q'));
const baseLabels: Record<string, string> = {
  sex: '性别',
  delivery_mode: '分娩方式',
  infancy_feed: '婴儿喂养方式',
  allergy_any: '过敏相关疾病',
};
function transform(a: Answers) {
  const raw = model.num.map((id: string, i: number) => {
    const v = Number(a[id]);
    return Number.isFinite(v) ? v : model.num_median[i];
  });
  const indicators = model.missing_indices.map((i: number) =>
    a[model.num[i]] === '' ? 1 : 0,
  );
  const nums = [...raw, ...indicators].map(
    (v, i) => (v - model.scale_mean[i]) / model.scale_scale[i],
  );
  const cats: number[] = [];
  model.cat.forEach((id: string, i: number) =>
    model.categories[i].forEach((c: string | number) =>
      cats.push(String(a[id] ?? model.cat_fill[i]) === String(c) ? 1 : 0),
    ),
  );
  return [...nums, ...cats];
}
function score(a: Answers) {
  const x = transform(a);
  const members = (model as any).models ?? [model];
  const all = members.map((member: any) => {
    let margin = Math.log(member.base_score / (1 - member.base_score));
    const contributions: Record<number, number> = {};
    for (const t of member.trees) {
      let n = 0;
      while (t.left_children[n] !== -1) {
        const f = t.split_indices[n];
        const v = Math.fround(x[f]);
        const th = Math.fround(t.split_conditions[n]);
        const next = v < th ? t.left_children[n] : t.right_children[n];
        contributions[f] =
          (contributions[f] ?? 0) +
          ((t as any).base_weights?.[next] ?? 0) -
          ((t as any).base_weights?.[n] ?? 0);
        n = next;
      }
      margin += t.split_conditions[n];
    }
    return { p: 1 / (1 + Math.exp(-margin)), contributions };
  });
  const contributions: Record<number, number> = {};
  all.forEach((r: any) =>
    Object.entries(r.contributions).forEach(([i, v]) =>
      contributions[Number(i)] = (contributions[Number(i)] ?? 0) + Number(v) / all.length,
    ),
  );
  return { p: all.reduce((s: number, r: any) => s + r.p, 0) / all.length, contributions };
}
function Field({
  id,
  value,
  set,
}: {
  id: string;
  value: string | number;
  set: (v: string | number) => void;
}) {
  return (
    <label className="field">
      <span>{(model.labels as Record<string, string>)[id] ?? id}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => set(e.target.value)}
        step={id.includes('bmi') ? 0.1 : 1}
      />
    </label>
  );
}
function BinaryField({ id, value, set }: { id: string; value: string | number; set: (v: string | number) => void }) {
  const opts = id === 'sex' ? [['0','女童'],['1','男童']] : [['0','无'],['1','有']];
  return <label className="field"><span>{(model.labels as Record<string,string>)[id] ?? id}</span><select value={String(value)} onChange={(e)=>set(e.target.value)}>{opts.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>;
}
export default function Page() {
  const initial: Answers = {};
  model.num.forEach(
    (id: string, i: number) =>
      (initial[id] = id.startsWith('q')
        ? 1
        : Number(model.num_median[i].toFixed(1))),
  );
  model.cat.forEach(
    (id: string, i: number) =>
      (initial[id] = model.cat_fill[i] as string | number),
  );
  const [a, setA] = useState<Answers>(initial);
  const set = (id: string, v: string | number) =>
    setA((s) => ({ ...s, [id]: v }));
  const r = useMemo(() => score(a), [a]);
  const names = [
    ...model.num,
    ...model.missing_indices.map((i: number) => `${model.num[i]}缺失`),
    ...model.cat.flatMap((id: string, i: number) =>
      model.categories[i].map((c: string | number) => `${id}=${c}`),
    ),
  ];
  const displayName = (name: string) => {
    if (name === 'sex=0') return '性别：女童';
    if (name === 'sex=1') return '性别：男童';
    if (name === 'delivery_mode=0') return '分娩方式：顺产';
    if (name === 'delivery_mode=1') return '分娩方式：剖宫产';
    if (name === 'delivery_mode=2') return '分娩方式：助产或其他';
    return (
      (model.labels as Record<string, string>)[name] ??
      name.replace('num__', '').replace('cat__', '')
    );
  };
  const local = Object.entries(r.contributions)
    .map(([i, v]) => ({ name: names[Number(i)] ?? `变量${i}`, value: v }))
    .sort((x, y) => Math.abs(y.value) - Math.abs(x.value))
    .slice(0, 8);
  return (
    <main className="shell">
      <header>
        <div>
          <p className="eyebrow">16变量精简模型 · 科研风险识别工具</p>
          <h1>7–14岁儿童肥胖风险识别</h1>
          <p>
            输入5项基础信息和11项通俗症状问卷评分，获得当前肥胖状态的风险识别概率。工具不使用当前身高、体重或BMI。
          </p>
        </div>
        <ShieldCheck />
      </header>
      <div className="layout">
        <section className="panel inputs">
          <h2>基础信息</h2>
          <div className="grid">
            {clinical.map((id: string) => (
              id === 'sex' || id === 'black_acanthosis'
                ? <BinaryField key={id} id={id} value={a[id]} set={(v) => set(id,v)} />
                : <Field key={id} id={id} value={a[id]} set={(v) => set(id, v)} />
            ))}
            {model.cat.map((id: string, i: number) => (
              <label className="field" key={id}>
                <span>{baseLabels[id] ?? id}</span>
                <select
                  value={String(a[id])}
                  onChange={(e) => set(id, e.target.value)}
                >
                  {model.categories[i].map((c: string | number) => (
                    <option key={String(c)} value={String(c)}>
                      {id === 'sex'
                        ? String(c) === '1'
                          ? '男童'
                          : '女童'
                        : id === 'delivery_mode'
                          ? ({'0':'顺产','1':'剖宫产','2':'助产或其他'} as Record<string,string>)[String(c)]
                        : id === 'allergy_any'
                          ? String(c) === '1'
                            ? '有'
                            : '无'
                          : String(c)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <details open>
            <summary>
              通俗症状简化问卷（{qids.length}项）
              <ChevronDown />
            </summary>
            <p className="hint">
              题目来源于儿童中医体质问卷，采用家长和儿童易理解的日常表述。评分：1从不或没有，2很少，3有时，4经常，5总是。
            </p>
            <div className="questions">
              {qids.map((id: string) => (
                <label key={id}>
                  <span>
                    {(model.labels as Record<string, string>)[id] ?? id}
                  </span>
                  <select
                    value={a[id]}
                    onChange={(e) => set(id, Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </details>
        </section>
        <aside>
          <section className="risk">
            <div className="risk-title">
              <span>模型估计概率</span>
              <Activity />
            </div>
            <strong>{(r.p * 100).toFixed(1)}%</strong>
            <div className="bar">
              <i style={{ width: `${Math.min(100, r.p * 100)}%` }} />
            </div>
          </section>
          <section className="panel explain">
            <h2>个体模型贡献</h2>
            <p className="hint">
              展示当前预测路径中影响最大的变量；正值推高风险，负值降低风险。
            </p>
            {local.map((x) => (
              <div className="impact" key={x.name}>
                <span>{displayName(x.name)}</span>
                <b className={x.value >= 0 ? 'up' : 'down'}>
                  {x.value >= 0 ? '+' : ''}
                  {x.value.toFixed(3)}
                </b>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </main>
  );
}
