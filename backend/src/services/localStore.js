const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

let state = {
  users: [],
  medications: [],
  doses: [],
  devices: [],
};

function loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      state = { ...state, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Local store load warning:', e.message);
  }
}

function saveStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    console.error('Local store save warning:', e.message);
  }
}

loadStore();

const newId = () => crypto.randomBytes(12).toString('hex');

function getNested(obj, keyPath) {
  return keyPath.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), obj);
}

function setNested(obj, keyPath, val) {
  const parts = keyPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = val;
}

function matchesQuery(doc, query = {}) {
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    if (k === '$expr') {
      if (v.$lte && Array.isArray(v.$lte)) {
        const left = doc[v.$lte[0].replace('$', '')];
        const right = doc[v.$lte[1].replace('$', '')];
        if (!(left <= right)) return false;
      }
      continue;
    }
    const actual = getNested(doc, k);
    if (v && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
      if ('$ne' in v && actual === v.$ne) return false;
      if ('$lt' in v && !(new Date(actual) < new Date(v.$lt))) return false;
      if ('$lte' in v && !(new Date(actual) <= new Date(v.$lte))) return false;
      if ('$gte' in v && !(new Date(actual) >= new Date(v.$gte))) return false;
    } else if (Array.isArray(actual)) {
      if (!actual.map(String).includes(String(v))) return false;
    } else if (String(actual) !== String(v)) {
      return false;
    }
  }
  return true;
}

function applyPopulate(doc, popSpec) {
  if (!doc || !popSpec) return doc;
  const copy = { ...doc };
  const fields = String(popSpec).split(/\s+/).filter(Boolean);
  for (const field of fields) {
    if (field === 'patient' && copy.patient && typeof copy.patient === 'string') {
      const u = state.users.find((x) => String(x._id) === String(copy.patient));
      if (u) copy.patient = { ...u };
    }
    if (field === 'addedBy' && copy.addedBy && typeof copy.addedBy === 'string') {
      const u = state.users.find((x) => String(x._id) === String(copy.addedBy));
      if (u) copy.addedBy = { ...u };
    }
    if (field === 'medication' && copy.medication && typeof copy.medication === 'string') {
      const m = state.medications.find((x) => String(x._id) === String(copy.medication));
      if (m) copy.medication = { ...m };
    }
    if (field === 'device' && copy.device && typeof copy.device === 'string') {
      const d = state.devices.find((x) => String(x._id) === String(copy.device));
      if (d) copy.device = { ...d };
    }
  }
  return copy;
}

function wrapDoc(collectionName, rawDoc) {
  if (!rawDoc) return null;
  const doc = { ...rawDoc };
  Object.defineProperty(doc, 'toObject', {
    enumerable: false,
    value: () => ({ ...doc }),
  });
  Object.defineProperty(doc, 'save', {
    enumerable: false,
    value: async function () {
      const arr = state[collectionName];
      const idx = arr.findIndex((x) => String(x._id) === String(this._id));
      const clean = { ...this, updatedAt: new Date().toISOString() };
      if (idx >= 0) arr[idx] = clean;
      else arr.push(clean);
      saveStore();
      return this;
    },
  });
  if (collectionName === 'users') {
    Object.defineProperty(doc, 'comparePassword', {
      enumerable: false,
      value: async function (candidate) {
        return bcrypt.compare(candidate, this.password || '');
      },
    });
  }
  return doc;
}

function createQueryChain(collectionName, isSingle, initialDocs) {
  let popFields = [];
  let sortSpec = null;

  const execute = () => {
    let list = initialDocs.map((d) => wrapDoc(collectionName, d));
    if (sortSpec) {
      const [key, dir] = Object.entries(sortSpec)[0];
      list.sort((a, b) => {
        const av = a[key];
        const bv = b[key];
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      });
    }
    for (const p of popFields) {
      list = list.map((d) => wrapDoc(collectionName, applyPopulate(d, p)));
    }
    return isSingle ? list[0] || null : list;
  };

  const chain = {
    populate(field) {
      popFields.push(field);
      return chain;
    },
    select() {
      return chain;
    },
    sort(spec) {
      sortSpec = spec;
      return chain;
    },
    then(resolve, reject) {
      try {
        resolve(execute());
      } catch (e) {
        if (reject) reject(e);
      }
    },
    catch(fn) {
      return Promise.resolve(chain).catch(fn);
    },
  };
  return chain;
}

function createLocalModel(collectionName, defaults = {}) {
  return {
    find(query = {}) {
      const matched = state[collectionName].filter((d) => matchesQuery(d, query));
      return createQueryChain(collectionName, false, matched);
    },
    findOne(query = {}) {
      const matched = state[collectionName].filter((d) => matchesQuery(d, query));
      return createQueryChain(collectionName, true, matched);
    },
    findById(id) {
      const matched = state[collectionName].filter((d) => String(d._id) === String(id));
      return createQueryChain(collectionName, true, matched);
    },
    async create(data) {
      const now = new Date().toISOString();
      const record = {
        _id: newId(),
        ...defaults,
        ...data,
        createdAt: now,
        updatedAt: now,
      };
      if (collectionName === 'users' && record.password && !record.password.startsWith('$2')) {
        record.password = await bcrypt.hash(record.password, 10);
      }
      state[collectionName].push(record);
      saveStore();
      return wrapDoc(collectionName, record);
    },
    findByIdAndUpdate(id, update = {}, opts = {}) {
      const arr = state[collectionName];
      const idx = arr.findIndex((x) => String(x._id) === String(id));
      if (idx === -1) return createQueryChain(collectionName, true, []);
      const doc = { ...arr[idx] };
      for (const [k, v] of Object.entries(update)) {
        if (k === '$inc') {
          for (const [ik, iv] of Object.entries(v)) doc[ik] = (doc[ik] || 0) + iv;
        } else if (k === '$push') {
          for (const [pk, pv] of Object.entries(v)) {
            doc[pk] = Array.isArray(doc[pk]) ? [...doc[pk], pv] : [pv];
          }
        } else {
          setNested(doc, k, v);
        }
      }
      doc.updatedAt = new Date().toISOString();
      arr[idx] = doc;
      saveStore();
      return createQueryChain(collectionName, true, [doc]);
    },
    async findOneAndUpdate(query = {}, update = {}, opts = {}) {
      const arr = state[collectionName];
      let idx = arr.findIndex((d) => matchesQuery(d, query));
      let doc;
      if (idx === -1) {
        if (!opts.upsert) return null;
        doc = {
          _id: newId(),
          ...defaults,
          ...query,
          createdAt: new Date().toISOString(),
        };
        arr.push(doc);
        idx = arr.length - 1;
      } else {
        doc = { ...arr[idx] };
      }
      for (const [k, v] of Object.entries(update)) {
        setNested(doc, k, v);
      }
      doc.updatedAt = new Date().toISOString();
      arr[idx] = doc;
      saveStore();
      return wrapDoc(collectionName, doc);
    },
    async updateMany(query = {}, update = {}) {
      let modifiedCount = 0;
      state[collectionName] = state[collectionName].map((d) => {
        if (matchesQuery(d, query)) {
          modifiedCount++;
          const next = { ...d };
          for (const [k, v] of Object.entries(update)) setNested(next, k, v);
          next.updatedAt = new Date().toISOString();
          return next;
        }
        return d;
      });
      if (modifiedCount > 0) saveStore();
      return { modifiedCount };
    },
    async deleteMany(query = {}) {
      const before = state[collectionName].length;
      state[collectionName] = state[collectionName].filter((d) => !matchesQuery(d, query));
      const deletedCount = before - state[collectionName].length;
      if (deletedCount > 0) saveStore();
      return { deletedCount };
    },
  };
}

let useFallback = false;
const setUseFallback = (val) => {
  useFallback = val;
};
const isUsingFallback = () => useFallback;

function createHybridModel(mongooseModel, collectionName, defaults = {}) {
  const local = createLocalModel(collectionName, defaults);
  return new Proxy(mongooseModel, {
    get(target, prop) {
      if (useFallback && prop in local) {
        return local[prop];
      }
      return target[prop];
    },
  });
}

module.exports = {
  createHybridModel,
  setUseFallback,
  isUsingFallback,
};
