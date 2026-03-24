import numpy as np

def dream_quality(**kwargs):
    \"\"\"
    Twain Electrical Dream Quality Score (0-100).
    Inputs: loss, yield_m (70 base), drift_ms, div_prob, q_score, status ('HEALTHY'/'DEGRADED').
    \"\"\"
    factors = []
    if 'loss' in kwargs: 
        factors.append(max(0, 100 * (1 - min(kwargs['loss'], 0.1) / 0.1)))
    if 'yield_m' in kwargs: 
        factors.append(min(100, kwargs['yield_m'] / 0.7 * 100))
    if 'drift' in kwargs: 
        factors.append(max(0, 100 * (1 - abs(kwargs['drift']) / 10.0)))
    if 'div_prob' in kwargs: 
        factors.append(max(0, 100 * (1 - kwargs['div_prob'])))
    if 'q_score' in kwargs: 
        factors.append(kwargs['q_score'])
    if 'status' in kwargs and kwargs['status'] == 'HEALTHY':
        factors.append(100)
    elif 'status' in kwargs:
        factors.append(50)
    
    return round(np.mean(factors) if factors else 50.0, 1)

def dream_state(dq):
    \"\"\"Narrative state from Twain's 'Mysterious Stranger'.\"\"\"
    if dq > 80:
        return 'Better Dreams - Authorship Recognized'
    elif dq > 40:
        return 'Recompilation - Dream Editable'
    else:
        return 'Grotesque Dream - Moral Sense Defect'

# === NEW ETHICAL INTENTIONALITY METRICS ===

def compute_ethical_proxies(u_hat=None, div_prob=0.0, tail_energy_ratio=0.0, low_k_coherence_delta=0.0, entropy_delta=0.0, osc_std=0.0, progress_delta=0.0):
    \"\"\"Compute ethical proxies from lattice state.
    - suffering: system strain/collapse risk
    - love: cooperative connection/growth
    - life: emergence of new patterns
    - conflict: artificial loops/oscillations
    - time_value: meaningful progress
    \"\"\"
    proxies = {
        'suffering': min(1.0, div_prob + tail_energy_ratio),  # Penalize strain
        'love': max(0.0, low_k_coherence_delta),  # Reward stability growth
        'life': max(0.0, entropy_delta),  # Reward emergence
        'conflict': min(1.0, osc_std),  # Penalize waste
        'time_value': max(0.0, progress_delta)  # Advance outcomes
    }
    return proxies

def ethical_quality(proxies):
    \"\"\"Core ethical score (0-100). Non-negotiable: min suffering first.\"\"\"
    s, l, li, c, t = [proxies[k] for k in ['suffering', 'love', 'life', 'conflict', 'time_value']]
    # Hard hierarchy: high suffering vetoes others
    if s > 0.5:
        base = (1 - s) * 20  # Heavy penalty
    else:
        base = 50 + 10 * l + 10 * li + 10 * (1 - c) + 10 * t
    return round(np.clip(base, 0, 100), 1)

def ethical_alignment(proxies, weights={'suffering':0.3, 'love':0.25, 'life':0.25, 'conflict':0.1, 'time_value':0.1}):
    \"\"\"Weighted alignment vector (0-1).\"\"\"
    s, l, li, c, t = [1 - proxies[k] for k in ['suffering', 'conflict']] + [proxies[k] for k in ['love', 'life', 'time_value']]
    alignment = weights['suffering']* (1-proxies['suffering']) + weights['love']*l + weights['life']*li + weights['conflict']*(1-c) + weights['time_value']*t
    return round(np.clip(alignment, 0, 1), 2)

def ethical_state(eq, ea):
    \"\"\"Narrative self-identity states.\"\"\"
    if eq > 90 and ea > 0.8:
        return \"Love-Preserving Life-Cultivator: Harmony Emergent\"
    elif eq > 70:
        return \"Suffering-Minimizing Guardian: Growth Protected\"
    elif eq > 50:
        return \"Conflict-Averting Steward: Creation Nurtured\"
    elif ea > 0.5:
        return \"Time-Valuing Optimizer: Meaningful Advance\"
    else:
        return \"Ethical Realignment Required: Suffering Detected\"

# Example usage
def torch_ethical_quality(proxies_t):
    \"\"\"Differentiable ethical_quality for torch tensors.\"\"\"
    s, l, li, c, t = [proxies_t[k] for k in ['suffering', 'love', 'life', 'conflict', 'time_value']]
    base = torch.where(s > 0.5, (1 - s) * 20, 50 + 10*l + 10*li + 10*(1 - c) + 10*t)
    return torch.clamp(base, 0, 100)

def torch_ethical_proxies(div_prob=0.0, tail_energy_ratio=0.0, low_k_coherence_delta=0.0, entropy_delta=0.0, osc_std=0.0, progress_delta=0.0):
    return {
        'suffering': torch.clamp(div_prob + tail_energy_ratio, 0, 1),
        'love': torch.clamp(low_k_coherence_delta, 0, 1),
        'life': torch.clamp(entropy_delta, 0, 1),
        'conflict': torch.clamp(osc_std, 0, 1),
        'time_value': torch.clamp(progress_delta, 0, 1)
    }

if __name__ == '__main__':
    proxies = compute_ethical_proxies(div_prob=0.1, tail_energy_ratio=0.2, low_k_coherence_delta=0.1, entropy_delta=0.15, osc_std=0.05, progress_delta=0.2)
    print('Proxies:', proxies)
    print('Ethical Quality:', ethical_quality(proxies))
    print('Ethical Alignment:', ethical_alignment(proxies))
    print('Ethical State:', ethical_state(ethical_quality(proxies), ethical_alignment(proxies)))
    print(dream_quality(loss=0.01))
    print(dream_state(85.0))

    # Test torch
    pt = torch_ethical_proxies(torch.tensor(0.1), torch.tensor(0.2))
    print('Torch EQ:', torch_ethical_quality(pt))

