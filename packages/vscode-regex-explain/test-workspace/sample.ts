// Hover a regex literal to see its explanation. Select any text to explain it instead.
export const phone = /^\(?(\d{3})\)?[-. ]?(\d{3})[-. ]?(\d{4})$/;
export const email = /^(?<user>[\w.+-]+)@([a-z\d-]+\.)+[a-z]{2,}$/i;
export const slow = /^(a+)+$/;
const width = 4;
const height = 3;
export const ratio = width / height / 2;
export const template = `not /a regex/ ${/but this is/.source}`;
