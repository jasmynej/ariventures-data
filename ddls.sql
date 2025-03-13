CREATE TABLE countries (
                           id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                           name text,
                           capital text,
                           region text,
                           sub_region text,
                           flag_img text
);

CREATE TABLE users (
                       id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                       username text,
                       password text,
                       email text,
                       type text
);

CREATE TABLE visa_status (
                             id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                             passport integer REFERENCES countries(id),
                             destination integer REFERENCES countries(id),
                             status text,
                             notes text
);