def calculate_analytics(logs_data):
    """
    Calculate Behavior Analytics (Energy, Routine, Wellness) from daily logs.
    """
    
    # 1. Default fallback structure
    result = {
        "energy": { "active": 50, "resting": 50 },
        "routine": { "score": 100, "status": "No Data" },
        "wellness": { "score": 80, "status": "Good" }
    }

    if not logs_data or len(logs_data) == 0:
        return result

    # 2. Extract unified metrics over the period
    total_logs = len(logs_data)
    active_count = 0
    resting_count = 0
    something_off_count = 0
    abnormal_behavior_count = 0

    # Routine consistency variables
    food_intakes = []
    litter_visits = 0

    for idx, raw_log in enumerate(logs_data):
        # Determine the detailed log dictionary (something_off vs normal)
        details = raw_log.get('something_off_logs', [{}])[0] if raw_log.get('log_type') == 'something_off' else raw_log.get('normal_logs', [{}])[0]
        if not details: details = {}
        
        # Merge properties conceptually
        unified_log = { **raw_log, **details }
        
        # Energy Distribution calculation (Mapping to model classes: active, eating, grooming, resting, toileting, unknown)
        behavior = unified_log.get('behavior', '').lower()
        if behavior in ['active', 'eating', 'grooming', 'toileting']:
            active_count += 1
        elif behavior in ['resting']:
            resting_count += 1
        # 'unknown' is ignored for active vs resting ratio to avoid skewing data
            
        # Wellness and Routine counts
        status = unified_log.get('status', 'Normal')
        if status == 'Something off':
            something_off_count += 1
        
        if behavior in ['hiding', 'lethargic', 'aggressive', 'agitated', 'vocalizing']:  # Red flag behaviors
            abnormal_behavior_count += 1
            
        if unified_log.get('food_amount'):
            food_intakes.append(unified_log.get('food_amount'))
            
        if unified_log.get('urine_level') or unified_log.get('stool_level'):
            litter_visits += 1

    # --- Energy Calculation ---
    total_behavior_recorded = active_count + resting_count
    if total_behavior_recorded > 0:
        active_pct = int((active_count / total_behavior_recorded) * 100)
        result["energy"]["active"] = active_pct
        result["energy"]["resting"] = 100 - active_pct
    else:
        # Default assume 30% active, 70% resting if just not explicitly logged but we have logs
        result["energy"] = { "active": 30, "resting": 70 }
        
    # --- Routine Calculation ---
    # Simplified metric: Are they eating a consistent amount?
    routine_score = 100
    if len(food_intakes) > 1:
        avg_food = sum(food_intakes) / len(food_intakes)
        # Check variance
        variances = [abs(f - avg_food) for f in food_intakes]
        avg_variance = sum(variances) / len(variances)
        
        # If variance > 20% of avg food, deduct points
        if avg_food > 0:
            variance_pct = (avg_variance / avg_food) * 100
            routine_score = max(0, 100 - int(variance_pct))
    
    # If they use the litter excessively or too little compared to normal (approx 1-3 times a day over logs)
    # This is a bit arbitrary without a long baseline, but let's assume > 3 visits per day avg is bad
    avg_litter_per_day = litter_visits / max(1, total_logs)
    if avg_litter_per_day > 3.5 or avg_litter_per_day < 0.5:
        routine_score -= 20
        
    routine_score = max(0, min(100, routine_score))
    result["routine"]["score"] = routine_score
    
    if routine_score >= 80: result["routine"]["status"] = "Excellent"
    elif routine_score >= 60: result["routine"]["status"] = "Good"
    elif routine_score >= 40: result["routine"]["status"] = "Fair"
    else: result["routine"]["status"] = "Irregular"

    # --- Wellness Calculation ---
    wellness_score = 100
    
    # Deduct 15 points for every 'Something off' log
    wellness_score -= (something_off_count * 15)
    # Deduct 10 points for abnormal behaviors
    wellness_score -= (abnormal_behavior_count * 10)
    
    wellness_score = max(0, min(100, wellness_score))
    result["wellness"]["score"] = wellness_score
    
    if wellness_score >= 85: result["wellness"]["status"] = "Optimal"
    elif wellness_score >= 65: result["wellness"]["status"] = "Good"
    elif wellness_score >= 40: result["wellness"]["status"] = "Monitoring"
    else: result["wellness"]["status"] = "At Risk"

    return result
