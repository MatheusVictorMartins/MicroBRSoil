const pool = require('../db');
const writeLog = require('../log_files/log_handler');
const crypto = require('crypto');

//! pass multiple parameters as objects
//! single parameters can be passed as a variable

/*
flow for the functions:
    receive input
    validate input
    build query
    send query to DB
    receive response
    validate response
    return response
    write to log
    on error
        write error message to log and exit the function
 */

const hashIdentifier = (value) => {
    if (!value) return '';
    return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
};

let passwordViewColumnCached = null;
let refreshTokenColumnCached = null;

const ensurePasswordViewColumn = async () => {
    if (passwordViewColumnCached === true) return true;
    try {
        await pool.query(
            `ALTER TABLE microbrsoil_db.users
             ADD COLUMN IF NOT EXISTS password_view TEXT`
        );
        passwordViewColumnCached = true;
        return true;
    } catch (err) {
        writeLog("\n[ERROR] ensurePasswordViewColumn: " + err);
        passwordViewColumnCached = false;
        return false;
    }
};

const hasPasswordViewColumn = async () => {
    if (passwordViewColumnCached !== null) return passwordViewColumnCached;
    try {
        const result = await pool.query(
            `SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'microbrsoil_db'
               AND table_name = 'users'
               AND column_name = 'password_view'
             LIMIT 1`
        );
        passwordViewColumnCached = result.rowCount > 0;
    } catch (err) {
        passwordViewColumnCached = false;
    }
    if (!passwordViewColumnCached) {
        await ensurePasswordViewColumn();
    }
    return passwordViewColumnCached;
};

const ensureRefreshTokenColumns = async () => {
    if (refreshTokenColumnCached === true) return true;
    try {
        await pool.query(
            `ALTER TABLE microbrsoil_db.users
             ADD COLUMN IF NOT EXISTS refresh_token_hash TEXT,
             ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMPTZ`
        );
        refreshTokenColumnCached = true;
        return true;
    } catch (err) {
        writeLog("\n[ERROR] ensureRefreshTokenColumns: " + err);
        refreshTokenColumnCached = false;
        return false;
    }
};

const hashRefreshToken = (token) => {
    if (!token) return '';
    return crypto.createHash('sha256').update(String(token)).digest('hex');
};

// creates user and returns the created row
const createUser = async ({ email, password, role = null, passwordView = null }) => {
    const values = [email, password];
    try {
        if (email == null || email === "" || typeof (email) != "string" || password == null || password === "" || typeof (password) != "string") {// input validator, must match type and cannot be undefined
            throw `Invalid input\n:email:${email} typeof: ${typeof (email)}\npassword:${password} typeof: ${typeof (password)}\nrole: ${role} typeof: ${typeof (role)}`;
        }

        // Resolve role_id dynamically to avoid broken FK
        let roleIdToUse = role;
        if (roleIdToUse == null) {
            // default = role "user"
            let roleLookup = await pool.query(
                `select role_id from microbrsoil_db.roles where role_name = $1 limit 1`,
                ['user']
            );
            if (roleLookup.rowCount === 0) {
                // try to recreate default roles if the seed did not run
                await pool.query(`
                    insert into microbrsoil_db.roles (role_name, description) values
                    ('admin', 'System administrator with full access'),
                    ('user', 'Default user with limited access'),
                    ('researcher', 'Researcher with access to analyses and results')
                    on conflict (role_name) do nothing
                `);
                roleLookup = await pool.query(
                    `select role_id from microbrsoil_db.roles where role_name = $1 limit 1`,
                    ['user']
                );
                if (roleLookup.rowCount === 0) {
                    throw `Default role 'user' not found in roles table (even after attempting to recreate)`;
                }
            }
            roleIdToUse = roleLookup.rows[0].role_id;
        } else if (typeof roleIdToUse === "string") {
            const roleLookup = await pool.query(
                `select role_id from microbrsoil_db.roles where role_name = $1 limit 1`,
                [roleIdToUse]
            );
            if (roleLookup.rowCount === 0) {
                throw `Role '${roleIdToUse}' not found in roles table`;
            }
            roleIdToUse = roleLookup.rows[0].role_id;
        } else if (typeof roleIdToUse !== "number") {
            throw `Invalid role: ${roleIdToUse} typeof: ${typeof roleIdToUse}`;
        }

        const columns = ['user_email', 'password_hash', 'role_id'];
        const params = [...values, roleIdToUse];

        if (passwordView && await ensurePasswordViewColumn()) {
            columns.push('password_view');
            params.push(passwordView);
        }

        const placeholders = params.map((_, idx) => `$${idx + 1}`).join(',');
        const query = `insert into microbrsoil_db.users (${columns.join(', ')}) values (${placeholders}) returning *`;
        const response = await pool.query(query, params);
        if (response.rowCount === 0) {
            throw `Bad response, likely did not find what you were looking for\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCCESS] createUser email_hash:" + hashIdentifier(email) + " role:" + roleIdToUse);
        return response;
    } catch (err) {
        writeLog("\n[ERROR]\nError message: " + err + "\nRedacted inputs: " + [hashIdentifier(email), "***", role]);
        return false;
    }
}

// deletes a user and returns the deleted row
const deleteUser = async (id) => {
    const values = [id];
    try {
        if (id == null || typeof (id) != "number") {// input validator, must match type and cannot be undefined
            throw `Invalid input\nID: ${id} typeof: ${typeof (id)}`;
        } else {
            const query = `delete from microbrsoil_db.users where user_id = $1 returning *`;
            const response = await pool.query(query, values);
            if (response.rowCount == 0) {
                throw `Bad response, likely did not find what you were looking for\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\n[SUCCESS] deleteUser id: " + id);
            return response;
        }
    } catch (err) {
        const redactedValues = values.map((val, idx) => {
            const col = columns[idx];
            if (col && col.includes('password')) return '***';
            if (col && col.includes('user_email')) return hashIdentifier(val);
            return val;
        });
        writeLog("\n[ERROR]\nError message: " + err + "\nRedacted inputs: " + redactedValues);
        return false;
    }
}

// returns user by id or returns all
const getUser = async (id = 0) => {
    const values = [id];
    try {
        if (id === undefined || typeof (id) != "number") {// input validator, must match type and cannot be undefined
            throw `Invalid input\nid: ${id} typeOf: ${typeof (id)}`;
        } else if (id === 0) {
            const query = `select * from microbrsoil_db.users`;
            const response = await pool.query(query);
            let regex = /\{/ig;
            if (response.rowCount == 0) {
                throw `Bad response, likely did not find what you were looking for\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            writeLog("\n[SUCCESS] getUser all users count: " + response.rowCount);
            return response;
        } else {
            const query = `select * from microbrsoil_db.users where user_id = $1`;
            const response = await pool.query(query, values);
            writeLog("\n[SUCCESS] getUser id: " + id);
            if (response.rowCount == 0) {
                throw `Bad response, likely did not find what you were looking for\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
            }
            return response;
        }
    } catch (err) {
        const redactedValues = values.map((val, idx) => {
            const col = columns[idx];
            if (col && col.includes('password')) return '***';
            if (col && col.includes('user_email')) return hashIdentifier(val);
            return val;
        });
        writeLog("\n[ERROR]\nError message: " + err + "\nRedacted inputs: " + redactedValues);
        return false;
    }
}

// logs in a user by comparing email and password
// returns the user row
const logUser = async (email) => {
    const values = [email];
    try {
        if (email == undefined || typeof (email) != "string") {// input validator, must match type and cannot be undefined
            throw `Input error in logUser\nemail: ${email} typeof: ${typeof (email)}}`
        } else {
            const query = `select * from microbrsoil_db.users where user_email = $1`;
            const response = await pool.query(query, values);
            if (response.rowCount == 0) {
                writeLog("\n[INFO] logUser: no user found for hash:" + hashIdentifier(email));
                return null;
            }
            writeLog("\n[SUCCESS] logUser lookup for hash:" + hashIdentifier(email));
            return response;
        }
    } catch (err) {
        writeLog("\n[ERROR]\nError message: " + err + "\nRedacted inputs: " + hashIdentifier(email));
        return false;
    }
}

// updates user by id
// returns the updated row
const updateUser = async ({ email, password, name, id }) => {
    // query generated dynamically based on inputs
    // the more inputs, the more values are added to the columns and values arrays
    const columns = [];// column to update
    const values = [];// new value
    let index = 1;// current array index for the query
    try {
        if (id == null || typeof id !== "number") {// input validator, must match type and cannot be undefined
            throw `Invalid formatting\nid: ${id} typeOf: ${typeof (id)}`;
        }
        if (email != null && email !== "" && typeof email === "string") {// values go to arrays if valid
            columns.push(`user_email = $${index}`);
            values.push(email);
            index++;
        }
        if (password != null && password !== "" && typeof password === "string") {
            columns.push(`user_password = $${index}`);
            values.push(password);
            index++;
        }
        if (name != null && name !== "" && typeof name === "string") {
            columns.push(`user_name = $${index}`);
            values.push(name);
            index++;
        }
        if (columns.length === 0) {// when no valid values exist in columns
            throw `Invalid formatting\nid: ${id} typeOf: ${typeof id}\nemail: ${email}\npassword: ${password}\nname: ${name}`;
        }

        values.push(id);
        const query = `UPDATE microbrsoil_db.users SET ${columns.join(', ')} WHERE user_id = $${index} RETURNING *`;// dynamic query
        const response = await pool.query(query, values);
        if (response.rowCount == 0) {
            throw `Bad response, likely did not find what you were looking for\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCCESS] updateUser id: " + id + " fields: " + columns.join(', '));
        return response;
    } catch (err) {
        const redactedValues = values.map((val, idx) => {
            const col = columns[idx];
            if (col && col.includes('password')) return '***';
            if (col && col.includes('user_email')) return hashIdentifier(val);
            return val;
        });
        writeLog("\n[ERROR]\nError message: " + err + "\nRedacted inputs: " + redactedValues);
        return false;
    }
}

const updatePasswordView = async ({ userId, passwordView }) => {
    try {
        if (!userId || !passwordView) return false;
        if (!await ensurePasswordViewColumn()) return false;

        const response = await pool.query(
            `UPDATE microbrsoil_db.users
             SET password_view = $1
             WHERE user_id = $2
               AND (password_view IS NULL OR password_view = '')
             RETURNING user_id`,
            [passwordView, userId]
        );
        return response.rowCount > 0;
    } catch (err) {
        writeLog("\n[ERROR] updatePasswordView userId: " + userId + " err: " + err);
        return false;
    }
};

const updateRefreshToken = async ({ userId, refreshToken, expiresAt }) => {
    try {
        if (!userId) return false;
        if (!await ensureRefreshTokenColumns()) return false;

        if (!refreshToken || !expiresAt) {
            const response = await pool.query(
                `UPDATE microbrsoil_db.users
                 SET refresh_token_hash = NULL,
                     refresh_token_expires_at = NULL
                 WHERE user_id = $1
                 RETURNING user_id`,
                [userId]
            );
            return response.rowCount > 0;
        }

        const tokenHash = hashRefreshToken(refreshToken);
        const response = await pool.query(
            `UPDATE microbrsoil_db.users
             SET refresh_token_hash = $1,
                 refresh_token_expires_at = $2
             WHERE user_id = $3
             RETURNING user_id`,
            [tokenHash, expiresAt, userId]
        );
        return response.rowCount > 0;
    } catch (err) {
        writeLog("\n[ERROR] updateRefreshToken userId: " + userId + " err: " + err);
        return false;
    }
};

const getUserByRefreshTokenHash = async (tokenHash) => {
    try {
        if (!tokenHash) return null;
        if (!await ensureRefreshTokenColumns()) return null;
        const response = await pool.query(
            `SELECT user_id, user_email, role_id, refresh_token_expires_at
             FROM microbrsoil_db.users
             WHERE refresh_token_hash = $1
             LIMIT 1`,
            [tokenHash]
        );
        return response.rowCount > 0 ? response.rows[0] : null;
    } catch (err) {
        writeLog("\n[ERROR] getUserByRefreshTokenHash: " + err);
        return null;
    }
};

const clearRefreshToken = async ({ userId }) => updateRefreshToken({ userId, refreshToken: null, expiresAt: null });

const listUsers = async () => {
    try {
        const query = `select * from microbrsoil_db.users`;
        const response = await pool.query(query);
        if (response.rowCount == 0) {
            throw `Bad response, likely did not find what you were looking for\nResponse:\n${JSON.stringify(response)}\n` + JSON.stringify(response.rows[0]);
        }
        writeLog("\n[SUCCESS]"+  "\nRows: " + JSON.stringify(response.rowCount));
        return response;
    } catch (err) {
        writeLog("\n[ERROR]\nError message: " + err);
        return false;
    }
}


module.exports = {
    createUser,
    deleteUser,
    getUser,
    logUser,
    updateUser,
    updatePasswordView,
    ensurePasswordViewColumn,
    ensureRefreshTokenColumns,
    updateRefreshToken,
    getUserByRefreshTokenHash,
    clearRefreshToken,
    listUsers,
} 
