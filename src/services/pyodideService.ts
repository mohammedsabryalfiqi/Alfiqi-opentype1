export interface FreezeResult {
  success: boolean;
  error?: string;
  lookups_count?: number;
  injected_into?: string[];
  source_features?: string[];
  name_changes?: any[];
  action?: 'freeze' | 'unfreeze' | 'mixed';
}

export interface AxisInfo {
  tag: string;
  name: string;
  minValue: number;
  defaultValue: number;
  maxValue: number;
}

export interface PinnedAxis {
  tag: string;
  name: string;
  value: number;
}

export interface VariableFontInfo {
  isVariable: boolean;
  axes: AxisInfo[];
  pinnedAxes?: PinnedAxis[];
  wasVariable?: boolean;
}

export interface FreezeAllResult {
  success: boolean;
  error?: string;
  frozen_axes?: string[];
  axis_method?: string;
  lookups_count?: number;
  injected_into?: string[];
  source_features?: string[];
  action?: string;
  metrics_preserved?: boolean;
  has_frozen?: boolean;
}

let pyodide: any = null;
let initPromise: Promise<void> | null = null;

export type LoadingStage = 'script' | 'runtime' | 'packages' | 'ready';
export type ProgressCallback = (stage: LoadingStage, message: string) => void;

// Preload the Pyodide script immediately
const preloadScript = (() => {
  if (typeof window === 'undefined') return Promise.resolve();
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'script';
  link.href = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js';
  document.head.appendChild(link);
  return Promise.resolve();
})();

const pythonScript = `
from fontTools.ttLib import TTFont
from io import BytesIO
import re

HAS_INSTANCER = False
_instancer_func = None
_mutator_func = None

try:
    from fontTools.instancer import instantiateVariableFont as _inst
    _instancer_func = _inst
    HAS_INSTANCER = True
except ImportError:
    pass

if not HAS_INSTANCER:
    try:
        from fontTools.varLib.instancer import instantiateVariableFont as _inst2
        _instancer_func = _inst2
        HAS_INSTANCER = True
    except ImportError:
        pass

HAS_MUTATOR = False
if not HAS_INSTANCER:
    try:
        from fontTools.varLib.mutator import instantiateVariableFont as _mut
        _mutator_func = _mut
        HAS_MUTATOR = True
    except ImportError:
        pass

def _save_os2_metrics(font):
    """Save OS/2 and head metrics before instancing to prevent size changes."""
    saved = {}
    if 'OS/2' in font:
        os2 = font['OS/2']
        saved['os2'] = {
            'sTypoAscender': os2.sTypoAscender,
            'sTypoDescender': os2.sTypoDescender,
            'sTypoLineGap': os2.sTypoLineGap,
            'usWinAscent': os2.usWinAscent,
            'usWinDescent': os2.usWinDescent,
            'sxHeight': getattr(os2, 'sxHeight', None),
            'sCapHeight': getattr(os2, 'sCapHeight', None),
        }
    if 'hhea' in font:
        hhea = font['hhea']
        saved['hhea'] = {
            'ascent': hhea.ascent,
            'descent': hhea.descent,
            'lineGap': hhea.lineGap,
        }
    if 'head' in font:
        saved['head'] = {
            'unitsPerEm': font['head'].unitsPerEm,
        }
    return saved

def _restore_os2_metrics(font, saved):
    """Restore OS/2 and hhea metrics after instancing to keep original size."""
    if 'os2' in saved and 'OS/2' in font:
        os2 = font['OS/2']
        m = saved['os2']
        os2.sTypoAscender = m['sTypoAscender']
        os2.sTypoDescender = m['sTypoDescender']
        os2.sTypoLineGap = m['sTypoLineGap']
        os2.usWinAscent = m['usWinAscent']
        os2.usWinDescent = m['usWinDescent']
        if m['sxHeight'] is not None and hasattr(os2, 'sxHeight'):
            os2.sxHeight = m['sxHeight']
        if m['sCapHeight'] is not None and hasattr(os2, 'sCapHeight'):
            os2.sCapHeight = m['sCapHeight']
    if 'hhea' in saved and 'hhea' in font:
        hhea = font['hhea']
        m = saved['hhea']
        hhea.ascent = m['ascent']
        hhea.descent = m['descent']
        hhea.lineGap = m['lineGap']

def _freeze_variable_font(font, axis_values):
    # Save metrics BEFORE instancing to prevent size distortion
    saved_metrics = _save_os2_metrics(font)

    if HAS_INSTANCER:
        try:
            _instancer_func(font, axis_values, inplace=True)
            _restore_os2_metrics(font, saved_metrics)
            return True, None
        except TypeError:
            pass
        try:
            result = _instancer_func(font, axis_values)
            for tag in result.keys():
                font[tag] = result[tag]
            _restore_os2_metrics(font, saved_metrics)
            return True, None
        except Exception as e:
            return False, str(e)
    
    if HAS_MUTATOR:
        try:
            instance = _mutator_func(font, axis_values)
            _restore_os2_metrics(instance, saved_metrics)
            out = BytesIO()
            instance.save(out)
            return True, out.getvalue()
        except Exception as e:
            return False, str(e)
    
    if 'fvar' not in font:
        return False, "No fvar table"
    
    fvar = font['fvar']
    for axis in fvar.axes:
        if axis.axisTag in axis_values:
            val = axis_values[axis.axisTag]
            axis.defaultValue = val
            axis.minValue = val
            axis.maxValue = val
    
    remaining = [a for a in fvar.axes if a.axisTag not in axis_values]
    if len(remaining) == 0:
        for tag in ['fvar', 'gvar', 'cvar', 'avar', 'STAT', 'MVAR', 'HVAR', 'VVAR']:
            if tag in font:
                del font[tag]
    _restore_os2_metrics(font, saved_metrics)
    return True, None

def get_features_py(font_bytes):
    font = TTFont(BytesIO(font_bytes))
    
    optional_tags = ['ss01','ss02','ss03','ss04','ss05','ss06','ss07','ss08','ss09','ss10',
                   'ss11','ss12','ss13','ss14','ss15','ss16','ss17','ss18','ss19','ss20',
                   'cv01','cv02','cv03','cv04','cv05','cv06','cv07','cv08','cv09','cv10',
                   'swsh','titl','salt','aalt','smcp','c2sc','dlig','hlig','lnum','onum',
                   'pnum','tnum','frac','zero','ordn','subs','sups','mgrk','ornm']
                   
    def get_table_features(table_tag):
        if table_tag not in font: return {}
        table = font[table_tag].table
        if not hasattr(table, 'FeatureList') or not table.FeatureList: return {}
        feats = {}
        for record in table.FeatureList.FeatureRecord:
            tag = record.FeatureTag
            if tag not in feats:
                feats[tag] = set()
            feats[tag].update(record.Feature.LookupListIndex)
        return feats

    gsub_feats = get_table_features('GSUB')
    gpos_feats = get_table_features('GPOS')
    
    available = set(gsub_feats.keys()).union(gpos_feats.keys())
    available_optional = [tag for tag in available if tag in optional_tags]
    
    gsub_mandatory = ['rlig','rclt','calt','liga']
    gpos_mandatory = ['kern','dist','mark','mkmk','curs']
    
    frozen_features = []
    
    for tag in available_optional:
        gsub_lookups = gsub_feats.get(tag, set())
        is_frozen_gsub = True
        if gsub_lookups:
            found_in_any = False
            for m_tag in gsub_mandatory:
                if m_tag in gsub_feats and gsub_lookups.issubset(gsub_feats[m_tag]):
                    found_in_any = True
                    break
            if not found_in_any:
                is_frozen_gsub = False
                
        gpos_lookups = gpos_feats.get(tag, set())
        is_frozen_gpos = True
        if gpos_lookups:
            found_in_any = False
            for m_tag in gpos_mandatory:
                if m_tag in gpos_feats and gpos_lookups.issubset(gpos_feats[m_tag]):
                    found_in_any = True
                    break
            if not found_in_any:
                is_frozen_gpos = False
                
        if is_frozen_gsub and is_frozen_gpos and (gsub_lookups or gpos_lookups):
            frozen_features.append(tag)

    return {"available": available_optional, "frozen": frozen_features}

def get_variable_info_py(font_bytes):
    font = TTFont(BytesIO(font_bytes))
    was_variable = False
    if 'fvar' not in font:
        if 'name' in font:
            name_table = font['name']
            for record in name_table.names:
                if record.nameID in (1, 3, 4, 6):
                    try:
                        name_str = record.toUnicode().lower()
                        if any(k in name_str for k in ['variable', 'vf', '-instance', 'mob']):
                            was_variable = True
                            break
                    except:
                        pass
        if any(tag in font for tag in ['STAT', 'HVAR', 'VVAR', 'MVAR', 'avar']):
            was_variable = True
        return {"isVariable": False, "axes": [], "wasVariable": was_variable}
    fvar = font['fvar']
    name_table = font.get('name')
    axes = []
    pinned_axes = []
    for axis in fvar.axes:
        axis_name = axis.axisTag
        if name_table:
            name_record = name_table.getName(axis.axisNameID, 3, 1, 0x0409)
            if name_record:
                axis_name = name_record.toUnicode()
            else:
                name_record = name_table.getName(axis.axisNameID, 1, 0, 0)
                if name_record:
                    axis_name = name_record.toUnicode()
        if axis.minValue == axis.maxValue:
            pinned_axes.append({"tag": axis.axisTag, "name": axis_name, "value": axis.defaultValue})
        else:
            axes.append({
                "tag": axis.axisTag,
                "name": axis_name,
                "minValue": axis.minValue,
                "defaultValue": axis.defaultValue,
                "maxValue": axis.maxValue,
            })
    return {"isVariable": True, "axes": axes, "pinnedAxes": pinned_axes, "wasVariable": False}

STANDARD_AXIS_RANGES = {
    'wght': (1, 1000),
    'wdth': (25, 200),
    'ital': (0, 1),
    'slnt': (-90, 90),
    'opsz': (5, 1200),
    'GRAD': (-1000, 1000),
    'CASL': (0, 1),
    'CRSV': (0, 1),
    'FILL': (0, 1),
    'MONO': (0, 1),
    'SOFT': (0, 100),
    'WONK': (0, 1),
}

def unfreeze_axes_py(font_bytes):
    font = TTFont(BytesIO(font_bytes))
    if 'fvar' not in font:
        return {"success": False, "error": "No fvar table"}
    
    fvar = font['fvar']
    has_gvar = 'gvar' in font
    has_cvar = 'cvar' in font
    has_variation_data = has_gvar or has_cvar
    
    restored = []
    for axis in fvar.axes:
        if axis.minValue == axis.maxValue:
            tag = axis.axisTag
            current_val = axis.defaultValue
            if tag in STANDARD_AXIS_RANGES:
                mn, mx = STANDARD_AXIS_RANGES[tag]
                mn = min(mn, current_val)
                mx = max(mx, current_val)
            else:
                if current_val == 0:
                    mn, mx = -100, 100
                else:
                    mn = current_val * 0.25
                    mx = current_val * 2.0
                    if mn > mx:
                        mn, mx = mx, mn
            axis.minValue = mn
            axis.maxValue = mx
            restored.append({"tag": tag, "value": current_val, "newMin": mn, "newMax": mx})
    
    if not restored:
        return {"success": False, "error": "No pinned axes found"}
    
    saved_metrics = _save_os2_metrics(font)
    _restore_os2_metrics(font, saved_metrics)
    
    out = BytesIO()
    font.save(out)
    return {
        "success": True,
        "bytes": out.getvalue(),
        "restored": [r["tag"] for r in restored],
        "details": restored,
        "has_variation_data": has_variation_data,
    }

def freeze_features_on_font(font, font_bytes_for_analysis, features_to_freeze_set):
    info = get_features_py(font_bytes_for_analysis)
    currently_frozen = set(info['frozen'])
    features_to_unfreeze = currently_frozen - features_to_freeze_set
    features_to_add = features_to_freeze_set - currently_frozen
    
    if features_to_add and features_to_unfreeze:
        action = 'mixed'
    elif features_to_unfreeze:
        action = 'unfreeze'
    else:
        action = 'freeze'
    
    def process_table(table_tag, mandatory_tags, preferred_tag=None, safe_tags=None):
        if table_tag not in font: return 0, []
        table = font[table_tag].table
        if not hasattr(table, 'FeatureList') or not table.FeatureList: return 0, []
        
        lookups_to_remove = set()
        for record in table.FeatureList.FeatureRecord:
            if record.FeatureTag in features_to_unfreeze:
                lookups_to_remove.update(record.Feature.LookupListIndex)
                
        lookups_to_add = []
        lookups_to_add_seen = set()
        for record in table.FeatureList.FeatureRecord:
            if record.FeatureTag in features_to_add:
                for l in record.Feature.LookupListIndex:
                    if l not in lookups_to_add_seen:
                        lookups_to_add.append(l)
                        lookups_to_add_seen.add(l)
                
        changes = 0
        injected = set()
        
        available_mandatory = set()
        for record in table.FeatureList.FeatureRecord:
            if record.FeatureTag in mandatory_tags:
                available_mandatory.add(record.FeatureTag)
        
        if safe_tags:
            safe_available = [t for t in safe_tags if t in available_mandatory]
            if safe_available:
                inject_targets = {safe_available[0]}
            elif preferred_tag and preferred_tag in available_mandatory:
                inject_targets = {preferred_tag}
            else:
                inject_targets = set()
        elif preferred_tag and preferred_tag in available_mandatory:
            inject_targets = {preferred_tag}
        else:
            inject_targets = available_mandatory
        
        if lookups_to_add and not inject_targets and safe_tags and preferred_tag:
            if not _OT_TABLES_OK:
                raise ImportError("fontTools.otTables not available - cannot create new feature record")
            new_record = _FR()
            new_record.FeatureTag = preferred_tag
            new_record.Feature = _FT()
            new_record.Feature.FeatureParams = None
            new_record.Feature.LookupListIndex = list(lookups_to_add)
            new_record.Feature.LookupCount = len(lookups_to_add)
            new_feat_idx = len(table.FeatureList.FeatureRecord)
            table.FeatureList.FeatureRecord.append(new_record)
            table.FeatureList.FeatureCount = len(table.FeatureList.FeatureRecord)
            if hasattr(table, 'ScriptList') and table.ScriptList:
                for script_record in table.ScriptList.ScriptRecord:
                    script = script_record.Script
                    def _add_feat_idx(ls):
                        if ls is None:
                            return
                        if new_feat_idx not in ls.FeatureIndex:
                            ls.FeatureIndex.append(new_feat_idx)
                            ls.FeatureCount = len(ls.FeatureIndex)
                    _add_feat_idx(script.DefaultLangSys)
                    if script.LangSysRecord:
                        for lang_record in script.LangSysRecord:
                            _add_feat_idx(lang_record.LangSys)
            changes = len(lookups_to_add)
            injected.add(preferred_tag)
            return changes, list(injected)
        
        for record in table.FeatureList.FeatureRecord:
            if record.FeatureTag in mandatory_tags:
                orig_lookups = [l for l in record.Feature.LookupListIndex if l not in lookups_to_remove]
                if record.FeatureTag in inject_targets:
                    for l in lookups_to_add:
                        if l not in orig_lookups:
                            orig_lookups.append(l)
                if orig_lookups != list(record.Feature.LookupListIndex):
                    record.Feature.LookupListIndex[:] = orig_lookups
                    changes += len(lookups_to_add) + len(lookups_to_remove)
                    injected.add(record.FeatureTag)
        return changes, list(injected)

    gsub_changes, gsub_injected = process_table('GSUB', ['rlig','rclt','calt','liga'],
        preferred_tag='calt', safe_tags=['calt','liga'])
    gpos_changes, gpos_injected = process_table('GPOS', ['kern','dist','mark','mkmk','curs'])
    
    return {
        "gsub_changes": gsub_changes,
        "gpos_changes": gpos_changes,
        "gsub_injected": gsub_injected,
        "gpos_injected": gpos_injected,
        "action": action,
        "features_to_add": features_to_add,
        "features_to_unfreeze": features_to_unfreeze,
    }

def _update_font_names(font, has_frozen_features):
    name_changes = []
    if 'name' not in font:
        return name_changes
    name_table = font['name']
    for record in name_table.names:
        if record.nameID in (1, 3, 4, 6, 16):
            try:
                old_name = record.toUnicode()
                new_name = old_name
                if has_frozen_features:
                    if " mob" not in old_name.lower() and "-mob" not in old_name.lower():
                        suffix = "-mob" if record.nameID == 6 else " mob"
                        new_name = old_name + suffix
                else:
                    new_name = re.sub(r'[\\s\\-]?[Mm][Oo][Bb]$', '', old_name)
                    new_name = re.sub(r'[\\s\\-]?[Mm][Oo][Bb]([\\s\\-])', r'\\1', new_name)
                if new_name != old_name:
                    if record.platformID == 3:
                        record.string = new_name.encode('utf_16_be')
                    elif record.platformID == 1:
                        record.string = new_name.encode('mac_roman', errors='ignore')
                    else:
                        record.string = new_name.encode('utf-8', errors='ignore')
                    name_changes.append(f"ID {record.nameID}")
            except Exception:
                pass
    return name_changes

def _remove_unselected_features(font, features_to_keep_set, all_optional_set):
    shaping_tags = {'init','medi','fina','isol','ccmp','rlig','rclt','calt','liga',
                    'kern','dist','mark','mkmk','curs','locl','blwf','blws','half',
                    'haln','nukt','akhn','rphf','rkrf','pref','pstf','psts','abvs',
                    'blwf','cjct','vatu','cfar','stch'}
    features_to_remove = (all_optional_set - features_to_keep_set) - shaping_tags
    if not features_to_remove:
        return 0, []

    removed_count = 0
    removed_tags = []

    for table_tag in ('GSUB', 'GPOS'):
        if table_tag not in font:
            continue
        table = font[table_tag].table
        if not hasattr(table, 'FeatureList') or not table.FeatureList:
            continue

        lookups_in_removed = set()
        lookups_in_kept = set()
        indices_to_remove = set()

        for i, record in enumerate(table.FeatureList.FeatureRecord):
            if record.FeatureTag in features_to_remove:
                lookups_in_removed.update(record.Feature.LookupListIndex)
                indices_to_remove.add(i)
                if record.FeatureTag not in removed_tags:
                    removed_tags.append(record.FeatureTag)
                removed_count += 1
            else:
                lookups_in_kept.update(record.Feature.LookupListIndex)

        if not indices_to_remove:
            continue

        exclusive_lookups = lookups_in_removed - lookups_in_kept

        if exclusive_lookups and hasattr(table, 'LookupList') and table.LookupList:
            for idx in exclusive_lookups:
                if idx < len(table.LookupList.Lookup):
                    lookup = table.LookupList.Lookup[idx]
                    lookup.SubTable = []
                    lookup.SubTableCount = 0

        mandatory_shaping = {'rlig', 'rclt', 'calt', 'liga', 'kern', 'dist', 'mark', 'mkmk', 'curs'}
        for record in table.FeatureList.FeatureRecord:
            if record.FeatureTag in mandatory_shaping and record.FeatureTag not in indices_to_remove:
                cleaned = [l for l in record.Feature.LookupListIndex if l not in exclusive_lookups]
                if len(cleaned) != len(record.Feature.LookupListIndex):
                    record.Feature.LookupListIndex[:] = cleaned

        old_to_new = {}
        new_idx = 0
        for i in range(len(table.FeatureList.FeatureRecord)):
            if i not in indices_to_remove:
                old_to_new[i] = new_idx
                new_idx += 1

        table.FeatureList.FeatureRecord = [r for i, r in enumerate(table.FeatureList.FeatureRecord) if i not in indices_to_remove]
        table.FeatureList.FeatureCount = len(table.FeatureList.FeatureRecord)

        if hasattr(table, 'ScriptList') and table.ScriptList:
            for script_record in table.ScriptList.ScriptRecord:
                script = script_record.Script
                def _remap_langsys(ls):
                    if ls is None:
                        return
                    ls.FeatureIndex = [old_to_new[fi] for fi in ls.FeatureIndex if fi in old_to_new]
                    ls.FeatureCount = len(ls.FeatureIndex)
                    if hasattr(ls, 'ReqFeatureIndex') and ls.ReqFeatureIndex is not None and ls.ReqFeatureIndex != 0xFFFF:
                        if ls.ReqFeatureIndex in old_to_new:
                            ls.ReqFeatureIndex = old_to_new[ls.ReqFeatureIndex]
                        else:
                            ls.ReqFeatureIndex = 0xFFFF
                _remap_langsys(script.DefaultLangSys)
                if script.LangSysRecord:
                    for lang_record in script.LangSysRecord:
                        _remap_langsys(lang_record.LangSys)

    return removed_count, removed_tags

def freeze_features_py(font_bytes, features_to_freeze):
    font = TTFont(BytesIO(font_bytes))
    features_to_freeze = set(features_to_freeze)
    res = freeze_features_on_font(font, font_bytes, features_to_freeze)
    gsub_changes = res["gsub_changes"]
    gpos_changes = res["gpos_changes"]
    action = res["action"]
    
    if gsub_changes == 0 and gpos_changes == 0 and (res["features_to_add"] or res["features_to_unfreeze"]):
        return {"success": False, "error": "No target mandatory features found in font to apply modifications"}
        
    name_changes = _update_font_names(font, len(features_to_freeze) > 0)
    out = BytesIO()
    font.save(out)
    return {
        "success": True,
        "lookups_count": gsub_changes + gpos_changes,
        "injected_into": res["gsub_injected"] + res["gpos_injected"],
        "source_features": list(features_to_freeze),
        "name_changes": name_changes,
        "action": action,
        "bytes": out.getvalue()
    }

def _rename_font(font, new_name):
    """Rename the font fully so it registers as a unique family in OS font books
    (e.g. Fontoo on iOS, Adobe Creative Cloud). This rewrites Family, Subfamily,
    Full Name, PostScript Name, Unique ID, and Preferred Family/Subfamily so
    each exported instance can coexist on the same device without collisions.
    It also strips any 'Instance' wording auto-added by the variable instancer."""
    if not new_name:
        return []
    new_name = new_name.strip()
    if not new_name:
        return []

    # PostScript name: no spaces, no illegal chars, max 63
    ps_name = re.sub(r'[\\s\\(\\)\\[\\]\\{\\}<>/%]+', '-', new_name)
    ps_name = re.sub(r'-+', '-', ps_name).strip('-')[:63] or "Font"

    changes = []
    if 'name' in font:
        name_table = font['name']
        # Map of nameID -> string we want to write
        targets = {
            1: new_name,        # Family
            2: 'Regular',       # Subfamily (force Regular so instances don't all become "Bold Italic Instance")
            3: new_name,        # Unique ID
            4: new_name,        # Full Name
            6: ps_name,         # PostScript Name
            16: new_name,       # Typographic / Preferred Family
            17: 'Regular',      # Typographic / Preferred Subfamily
            18: new_name,       # Mac compatible full
            21: new_name,       # WWS Family
            22: 'Regular',      # WWS Subfamily
            25: ps_name,        # Variations PostScript Name Prefix
        }
        # First, scrub 'Instance' wording from any remaining records we don't overwrite
        for record in list(name_table.names):
            try:
                old = record.toUnicode()
                cleaned = re.sub(r'\\s*[-_]?\\s*Instance\\b', '', old, flags=re.IGNORECASE).strip()
                if cleaned != old and record.nameID not in targets:
                    if record.platformID == 3:
                        record.string = cleaned.encode('utf_16_be')
                    elif record.platformID == 1:
                        record.string = cleaned.encode('mac_roman', errors='ignore')
                    else:
                        record.string = cleaned.encode('utf-8', errors='ignore')
            except Exception:
                pass

        for record in name_table.names:
            if record.nameID not in targets:
                continue
            value = targets[record.nameID]
            try:
                if record.platformID == 3:
                    record.string = value.encode('utf_16_be')
                elif record.platformID == 1:
                    record.string = value.encode('mac_roman', errors='ignore')
                else:
                    value.encode('utf-8', errors='ignore')
                    record.string = value.encode('utf-8', errors='ignore')
                changes.append(f"ID {record.nameID}")
            except Exception:
                pass

    # Update CFF table for OTF/PostScript fonts so Adobe apps see the new name
    if 'CFF ' in font:
        try:
            cff = font['CFF '].cff
            if hasattr(cff, 'fontNames') and cff.fontNames:
                cff.fontNames = [ps_name]
                changes.append("CFF.fontNames")
            if hasattr(cff, 'topDictIndex'):
                top_dict = cff.topDictIndex[0]
                if hasattr(top_dict, 'FullName'):
                    top_dict.FullName = new_name
                    changes.append("CFF.FullName")
                if hasattr(top_dict, 'FamilyName'):
                    top_dict.FamilyName = new_name
                    changes.append("CFF.FamilyName")
        except Exception:
            pass

    return changes

def freeze_all_py(font_bytes, axis_values=None, features_to_freeze=None, all_optional=None, custom_name=None):
    font = TTFont(BytesIO(font_bytes))
    axis_method = None
    metrics_preserved = False
    if axis_values and len(axis_values) > 0 and 'fvar' in font:
        metrics_preserved = True
        success, extra = _freeze_variable_font(font, dict(axis_values))
        if not success:
            return {"success": False, "error": f"Axis freeze failed: {extra}"}
        if isinstance(extra, bytes):
            font = TTFont(BytesIO(extra))
        axis_method = "instancer" if HAS_INSTANCER else ("mutator" if HAS_MUTATOR else "manual")
    
    feat_result = None
    has_frozen = False
    if features_to_freeze is not None:
        tmp = BytesIO()
        font.save(tmp)
        current_bytes = tmp.getvalue()
        font = TTFont(BytesIO(current_bytes))
        feat_set = set(features_to_freeze)
        feat_result = freeze_features_on_font(font, current_bytes, feat_set)
        has_frozen = len(feat_set) > 0
        _update_font_names(font, has_frozen)

    rename_changes = []
    if custom_name:
        rename_changes = _rename_font(font, custom_name)

    out = BytesIO()
    font.save(out)
    
    result = {"success": True, "bytes": out.getvalue(), "metrics_preserved": metrics_preserved}
    if axis_values:
        result["frozen_axes"] = list(axis_values.keys())
        result["axis_method"] = axis_method
    if feat_result:
        result["lookups_count"] = feat_result["gsub_changes"] + feat_result["gpos_changes"]
        result["injected_into"] = feat_result["gsub_injected"] + feat_result["gpos_injected"]
        result["action"] = feat_result["action"]
    if features_to_freeze:
        result["source_features"] = list(features_to_freeze)
    result["has_frozen"] = has_frozen
    result["rename_changes"] = rename_changes
    return result
`;

export const initPyodide = async (onProgress?: ProgressCallback): Promise<void> => {
  if (pyodide) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    onProgress?.('script', 'جاري تحميل محرك Python...');

    if (!(window as any).loadPyodide) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Pyodide script'));
        document.head.appendChild(script);
      });
    }

    onProgress?.('runtime', 'جاري تهيئة بيئة التشغيل...');
    pyodide = await (window as any).loadPyodide();

    onProgress?.('packages', 'جاري تثبيت مكتبة FontTools...');
    await pyodide.loadPackage('micropip');
    try {
      await pyodide.runPythonAsync(`
import micropip
await micropip.install('fonttools>=4.47.0')
try:
    await micropip.install('brotli')
except:
    pass
`);
    } catch {
      try {
        await pyodide.runPythonAsync(`
import micropip
await micropip.install('fonttools')
`);
      } catch {
        // use bundled version
      }
    }

    try {
      await pyodide.runPythonAsync(`
_OT_TABLES_OK = False
try:
    from fontTools.otTables import FeatureRecord as _FR, Feature as _FT
    _OT_TABLES_OK = True
    print("fontTools.otTables loaded directly")
except ImportError:
    try:
        from fontTools.ttLib.tables import otTables
        _FR = otTables.FeatureRecord
        _FT = otTables.Feature
        _OT_TABLES_OK = True
        print("fontTools.otTables loaded via ttLib.tables")
    except (ImportError, AttributeError):
        pass

if not _OT_TABLES_OK:
    try:
        from fontTools.ttLib import TTFont as _TF2
        _tmp = _TF2()
        _tmp['GSUB'] = _tmp.newTable('GSUB')
        from fontTools.otTables import FeatureRecord as _FR, Feature as _FT
        _OT_TABLES_OK = True
        print("fontTools.otTables loaded after table init")
        del _tmp, _TF2
    except:
        pass

if not _OT_TABLES_OK:
    print("WARNING: fontTools.otTables not available")
`);
    } catch {
      console.warn('fontTools.otTables preload failed');
    }

    onProgress?.('ready', 'جاري إعداد الوظائف...');
    await pyodide.runPythonAsync(pythonScript);
    try {
      await pyodide.runPythonAsync(`
_method = "instancer" if HAS_INSTANCER else ("mutator" if HAS_MUTATOR else "manual")
`);
      const method = pyodide.globals.get('_method');
      console.log('Font axis freeze method:', method);
    } catch {}
  })();

  return initPromise;
};

export const getFontFeatures = async (
  buffer: ArrayBuffer
): Promise<{ error?: string; features: string[]; frozenFeatures: string[] }> => {
  try {
    const fontBytes = new Uint8Array(buffer);
    pyodide.globals.set('font_bytes', fontBytes);
    await pyodide.runPythonAsync(`info = get_features_py(bytes(font_bytes))`);
    const info = pyodide.globals.get('info').toJs({ dict_converter: Object.fromEntries });
    return { features: info.available, frozenFeatures: info.frozen };
  } catch (error: any) {
    return { error: error.message, features: [], frozenFeatures: [] };
  }
};

export const getVariableFontInfo = async (
  buffer: ArrayBuffer
): Promise<VariableFontInfo> => {
  try {
    const fontBytes = new Uint8Array(buffer);
    pyodide.globals.set('font_bytes', fontBytes);
    await pyodide.runPythonAsync(`var_info = get_variable_info_py(bytes(font_bytes))`);
    const info = pyodide.globals.get('var_info').toJs({ dict_converter: Object.fromEntries });
    const axes: AxisInfo[] = [];
    const pinnedAxes: PinnedAxis[] = [];
    if (info.axes) {
      for (const a of info.axes) {
        const axisObj = a instanceof Map ? Object.fromEntries(a) : a;
        axes.push({
          tag: axisObj.tag,
          name: axisObj.name,
          minValue: axisObj.minValue,
          defaultValue: axisObj.defaultValue,
          maxValue: axisObj.maxValue,
        });
      }
    }
    if (info.pinnedAxes) {
      for (const a of info.pinnedAxes) {
        const axisObj = a instanceof Map ? Object.fromEntries(a) : a;
        pinnedAxes.push({ tag: axisObj.tag, name: axisObj.name, value: axisObj.value });
      }
    }
    return { isVariable: info.isVariable, axes, pinnedAxes, wasVariable: info.wasVariable || false };
  } catch (error: any) {
    console.error('getVariableFontInfo error:', error);
    return { isVariable: false, axes: [] };
  }
};

export const freezeAxes = async (
  buffer: ArrayBuffer,
  axisValues: Record<string, number>
): Promise<{ success: boolean; error?: string; bytes?: Uint8Array }> => {
  try {
    const fontBytes = new Uint8Array(buffer);
    pyodide.globals.set('font_bytes', fontBytes);
    pyodide.globals.set('axis_values_js', axisValues);
    await pyodide.runPythonAsync(`
av = axis_values_js.to_py() if hasattr(axis_values_js, 'to_py') else dict(axis_values_js)
axis_result = freeze_axes_py(bytes(font_bytes), av)
    `);
    const result = pyodide.globals.get('axis_result').toJs({ dict_converter: Object.fromEntries });
    let bytes: Uint8Array | undefined;
    if (result.success && result.bytes) {
      bytes = new Uint8Array(result.bytes);
    }
    return { success: result.success, error: result.error, bytes };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const processFont = async (
  buffer: ArrayBuffer,
  selectedFeatures: string[]
): Promise<{ result: FreezeResult; bytes?: Uint8Array }> => {
  try {
    const fontBytes = new Uint8Array(buffer);
    pyodide.globals.set('font_bytes', fontBytes);
    pyodide.globals.set('selected_features', selectedFeatures);
    await pyodide.runPythonAsync(`
py_features = selected_features.to_py() if hasattr(selected_features, 'to_py') else list(selected_features)
result_dict = freeze_features_py(bytes(font_bytes), py_features)
    `);
    const resultDict = pyodide.globals.get('result_dict').toJs({ dict_converter: Object.fromEntries });
    const result: FreezeResult = {
      success: resultDict.success,
      error: resultDict.error,
      lookups_count: resultDict.lookups_count,
      injected_into: resultDict.injected_into,
      source_features: resultDict.source_features,
      name_changes: resultDict.name_changes,
      action: resultDict.action,
    };
    let bytes: Uint8Array | undefined;
    if (result.success && resultDict.bytes) {
      bytes = new Uint8Array(resultDict.bytes);
    }
    return { result, bytes };
  } catch (error: any) {
    return { result: { success: false, error: error.message } };
  }
};

export const unfreezeVariableAxes = async (
  buffer: ArrayBuffer
): Promise<{ success: boolean; error?: string; bytes?: Uint8Array; restored?: string[]; hasVariationData?: boolean }> => {
  try {
    const fontBytes = new Uint8Array(buffer);
    pyodide.globals.set('font_bytes', fontBytes);
    await pyodide.runPythonAsync(`unfreeze_axes_result = unfreeze_axes_py(bytes(font_bytes))`);
    const result = pyodide.globals.get('unfreeze_axes_result').toJs({ dict_converter: Object.fromEntries });
    let bytes: Uint8Array | undefined;
    if (result.success && result.bytes) {
      bytes = new Uint8Array(result.bytes);
    }
    return {
      success: result.success,
      error: result.error,
      bytes,
      restored: result.restored,
      hasVariationData: result.has_variation_data,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const freezeAll = async (
  buffer: ArrayBuffer,
  axisValues?: Record<string, number>,
  selectedFeatures?: string[],
  allOptionalFeatures?: string[],
  customName?: string
): Promise<{ result: FreezeAllResult; bytes?: Uint8Array }> => {
  try {
    const fontBytes = new Uint8Array(buffer);
    pyodide.globals.set('font_bytes', fontBytes);
    pyodide.globals.set('axis_values_js', axisValues || {});
    const hasFeatures = selectedFeatures !== undefined;
    pyodide.globals.set('features_js', selectedFeatures || []);
    pyodide.globals.set('has_features_flag', hasFeatures);
    pyodide.globals.set('all_optional_js', allOptionalFeatures || []);
    pyodide.globals.set('custom_name_js', customName || '');
    await pyodide.runPythonAsync(`
av = axis_values_js.to_py() if hasattr(axis_values_js, 'to_py') else dict(axis_values_js)
fl = features_js.to_py() if hasattr(features_js, 'to_py') else list(features_js)
ao = all_optional_js.to_py() if hasattr(all_optional_js, 'to_py') else list(all_optional_js)
cn = str(custom_name_js) if custom_name_js else None
freeze_all_result = freeze_all_py(bytes(font_bytes), av if len(av) > 0 else None, fl if has_features_flag else None, ao if len(ao) > 0 else None, cn)
    `);
    const resultDict = pyodide.globals.get('freeze_all_result').toJs({ dict_converter: Object.fromEntries });
    let bytes: Uint8Array | undefined;
    if (resultDict.success && resultDict.bytes) {
      bytes = new Uint8Array(resultDict.bytes);
    }
    const result: FreezeAllResult = {
      success: resultDict.success,
      error: resultDict.error,
      frozen_axes: resultDict.frozen_axes,
      axis_method: resultDict.axis_method,
      lookups_count: resultDict.lookups_count,
      injected_into: resultDict.injected_into,
      source_features: resultDict.source_features,
      action: resultDict.action,
      metrics_preserved: resultDict.metrics_preserved,
      has_frozen: resultDict.has_frozen,
    };
    return { result, bytes };
  } catch (error: any) {
    return { result: { success: false, error: error.message } };
  }
};
