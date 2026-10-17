module.exports = function hostPolicyCache(fresh = () => true) {
    const values = new Map();
    return {
        get: async (key) =>
            key.startsWith('xera:host-policy:capabilities:')
                ? (values.get(key) ?? null)
                : fresh(key),
        set: async (key, value) => {
            values.set(key, value);
        },
        del: async (key) => {
            values.delete(key);
        },
    };
};
