import 'dotenv/config'
import pg from 'pg'

const databaseUrl = (process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || '').trim()
const databaseSsl = String(process.env.SUPABASE_DB_SSL ?? 'true').toLowerCase() !== 'false'

if (!databaseUrl) {
  console.error('SUPABASE_DB_URL is missing.')
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: databaseSsl ? { rejectUnauthorized: false } : false,
})

async function columnExists(client, table, column) {
  const result = await client.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1`,
    [table, column],
  )
  return Boolean(result.rowCount)
}

async function addColumn(client, table, column, type, suffix = '') {
  await client.query(`ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS ${column} ${type} ${suffix}`)
}

async function relaxColumn(client, table, column) {
  if (await columnExists(client, table, column)) {
    await client.query(`ALTER TABLE public.${table} ALTER COLUMN "${column}" DROP NOT NULL`)
  }
}

async function main() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')

    await ensureSharedTables(client)
    await ensureMissingAppTables(client)
    await seedCatalog(client)

    await client.query('COMMIT')
    console.log('Supabase app schema compatibility sync complete.')
  } catch (error) {
    await client.query('ROLLBACK')
    console.error(error)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

async function ensureSharedTables(client) {
  await ensureRoleTable(client)
  await ensureUserTable(client)
  await ensureProductTable(client)
  await ensureServiceTable(client)
  await ensureProjectTable(client)
  await ensureQuotationTable(client)
}

async function ensureRoleTable(client) {
  await addColumn(client, 'tbl_role', 'v_roleid', 'uuid', 'DEFAULT gen_random_uuid()')
  await addColumn(client, 'tbl_role', 'v_rolename', 'varchar(50)')
  await addColumn(client, 'tbl_role', 'v_roledescription', 'text')
  await addColumn(client, 'tbl_role', 'v_isactive', 'boolean', 'DEFAULT true')
  await addColumn(client, 'tbl_role', 'v_createdat', 'timestamptz', 'DEFAULT now()')
  await addColumn(client, 'tbl_role', 'v_updatedat', 'timestamptz', 'DEFAULT now()')
  await client.query(`
    UPDATE public.tbl_role
       SET v_roleid = COALESCE(v_roleid, gen_random_uuid()),
           v_rolename = COALESCE(v_rolename, "v_roleName"),
           v_roledescription = COALESCE(v_roledescription, "v_roleDescription"::text),
           v_isactive = COALESCE(v_isactive, "v_isActive"),
           v_createdat = COALESCE(v_createdat, "v_createdAt"::timestamptz),
           v_updatedat = COALESCE(v_updatedat, "v_updatedAt"::timestamptz, now())
  `)
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_katala_app_role_id ON public.tbl_role(v_roleid)')
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_katala_app_role_name ON public.tbl_role(v_rolename)')
  await client.query(`
    CREATE OR REPLACE FUNCTION public.katala_sync_role_app_columns()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.v_roleid := COALESCE(NEW.v_roleid, gen_random_uuid());
      NEW.v_rolename := COALESCE(NEW.v_rolename, NEW."v_roleName");
      NEW."v_roleName" := COALESCE(NEW."v_roleName", NEW.v_rolename);
      NEW.v_roledescription := COALESCE(NEW.v_roledescription, NEW."v_roleDescription"::text);
      NEW."v_roleDescription" := COALESCE(NEW."v_roleDescription", NEW.v_roledescription);
      NEW.v_isactive := COALESCE(NEW.v_isactive, NEW."v_isActive", TRUE);
      NEW."v_isActive" := COALESCE(NEW."v_isActive", NEW.v_isactive, TRUE);
      NEW.v_createdat := COALESCE(NEW.v_createdat, NEW."v_createdAt"::timestamptz, now());
      NEW."v_createdAt" := COALESCE(NEW."v_createdAt", NEW.v_createdat::timestamp);
      NEW.v_updatedat := COALESCE(NEW.v_updatedat, now());
      NEW."v_updatedAt" := COALESCE(NEW."v_updatedAt", NEW.v_updatedat::timestamp);
      RETURN NEW;
    END;
    $$;
    DROP TRIGGER IF EXISTS katala_sync_role_app_columns ON public.tbl_role;
    CREATE TRIGGER katala_sync_role_app_columns
      BEFORE INSERT OR UPDATE ON public.tbl_role
      FOR EACH ROW EXECUTE FUNCTION public.katala_sync_role_app_columns();
  `)
  await client.query(`
    INSERT INTO public.tbl_role (v_rolename, v_roledescription, v_isactive)
    VALUES
      ('Admin', 'Katala administrator portal account', true),
      ('Staff', 'Katala staff portal account', true),
      ('Customer', 'Katala customer portal account', true)
    ON CONFLICT (v_rolename) DO UPDATE SET v_isactive = EXCLUDED.v_isactive
  `)
}

async function ensureUserTable(client) {
  await addColumn(client, 'tbl_user', 'v_userid', 'uuid', 'DEFAULT gen_random_uuid()')
  await addColumn(client, 'tbl_user', 'v_roleid', 'uuid')
  await addColumn(client, 'tbl_user', 'v_username', 'varchar(255)')
  await addColumn(client, 'tbl_user', 'v_passwordhash', 'varchar(255)')
  await addColumn(client, 'tbl_user', 'v_firstname', 'varchar(100)')
  await addColumn(client, 'tbl_user', 'v_lastname', 'varchar(100)')
  await addColumn(client, 'tbl_user', 'v_emailaddress', 'varchar(255)')
  await addColumn(client, 'tbl_user', 'v_contactnumber', 'varchar(40)')
  await addColumn(client, 'tbl_user', 'v_mobilenumber', 'varchar(40)')
  await addColumn(client, 'tbl_user', 'v_accountstatus', 'varchar(30)', "DEFAULT 'Active'")
  await addColumn(client, 'tbl_user', 'v_isactive', 'boolean', 'DEFAULT true')
  await addColumn(client, 'tbl_user', 'v_createdat', 'timestamptz', 'DEFAULT now()')
  await addColumn(client, 'tbl_user', 'v_updatedat', 'timestamptz', 'DEFAULT now()')
  await addColumn(client, 'tbl_user', 'v_companyname', 'varchar(255)')
  await addColumn(client, 'tbl_user', 'v_jobtitle', 'varchar(120)')
  await addColumn(client, 'tbl_user', 'v_industry', 'varchar(120)')
  await addColumn(client, 'tbl_user', 'v_companyaddress', 'text')
  await addColumn(client, 'tbl_user', 'v_assignedstaffname', 'varchar(160)')
  await addColumn(client, 'tbl_user', 'v_staffdesignation', 'varchar(160)')
  await addColumn(client, 'tbl_user', 'v_department', 'varchar(160)')
  await client.query(`
    UPDATE public.tbl_user u
       SET v_userid = COALESCE(u.v_userid, gen_random_uuid()),
           v_roleid = COALESCE(u.v_roleid, r.v_roleid),
           v_username = COALESCE(u.v_username, u."v_userName"),
           v_passwordhash = COALESCE(u.v_passwordhash, u."v_passwordHash"),
           v_firstname = COALESCE(u.v_firstname, u."v_firstName"),
           v_lastname = COALESCE(u.v_lastname, u."v_lastName"),
           v_emailaddress = COALESCE(u.v_emailaddress, u."v_emailAddress"),
           v_contactnumber = COALESCE(u.v_contactnumber, u."v_mobileNumber"),
           v_mobilenumber = COALESCE(u.v_mobilenumber, u."v_mobileNumber", u.v_contactnumber),
           v_accountstatus = COALESCE(u.v_accountstatus, u."v_accountStatus", 'Active'),
           v_isactive = COALESCE(u.v_isactive, u."v_isActive", TRUE),
           v_createdat = COALESCE(u.v_createdat, u."v_createdAt"::timestamptz),
           v_updatedat = COALESCE(u.v_updatedat, u."v_updatedAt"::timestamptz, now())
      FROM public.tbl_role r
     WHERE r."v_roleId" = u."v_roleId"
        OR u."v_roleId" IS NULL
  `)
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_katala_app_user_id ON public.tbl_user(v_userid)')
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_katala_app_user_email ON public.tbl_user(v_emailaddress)')
  await client.query(`
    CREATE OR REPLACE FUNCTION public.katala_sync_user_app_columns()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    DECLARE
      legacy_role_id bigint;
      app_role_id uuid;
    BEGIN
      NEW.v_userid := COALESCE(NEW.v_userid, gen_random_uuid());
      NEW.v_emailaddress := COALESCE(NEW.v_emailaddress, NEW."v_emailAddress");
      NEW."v_emailAddress" := COALESCE(NEW."v_emailAddress", NEW.v_emailaddress);
      NEW.v_username := COALESCE(NEW.v_username, NEW."v_userName", NEW.v_emailaddress, NEW.v_userid::text);
      NEW."v_userName" := COALESCE(NEW."v_userName", NEW.v_username, NEW.v_emailaddress, NEW.v_userid::text);
      NEW.v_passwordhash := COALESCE(NEW.v_passwordhash, NEW."v_passwordHash");
      NEW."v_passwordHash" := COALESCE(NEW."v_passwordHash", NEW.v_passwordhash);
      NEW.v_firstname := COALESCE(NEW.v_firstname, NEW."v_firstName", '');
      NEW."v_firstName" := COALESCE(NEW."v_firstName", NEW.v_firstname);
      NEW.v_lastname := COALESCE(NEW.v_lastname, NEW."v_lastName", '');
      NEW."v_lastName" := COALESCE(NEW."v_lastName", NEW.v_lastname);
      NEW.v_contactnumber := COALESCE(NEW.v_contactnumber, NEW."v_mobileNumber");
      NEW.v_mobilenumber := COALESCE(NEW.v_mobilenumber, NEW."v_mobileNumber", NEW.v_contactnumber);
      NEW."v_mobileNumber" := COALESCE(NEW."v_mobileNumber", NEW.v_mobilenumber, NEW.v_contactnumber);
      NEW.v_accountstatus := COALESCE(NEW.v_accountstatus, NEW."v_accountStatus", 'Active');
      NEW."v_accountStatus" := COALESCE(NEW."v_accountStatus", NEW.v_accountstatus);
      NEW.v_isactive := COALESCE(NEW.v_isactive, NEW."v_isActive", TRUE);
      NEW."v_isActive" := COALESCE(NEW."v_isActive", NEW.v_isactive, TRUE);
      IF NEW.v_roleid IS NULL AND NEW."v_roleId" IS NOT NULL THEN
        SELECT v_roleid INTO app_role_id FROM public.tbl_role WHERE "v_roleId" = NEW."v_roleId" LIMIT 1;
        NEW.v_roleid := app_role_id;
      END IF;
      IF NEW."v_roleId" IS NULL AND NEW.v_roleid IS NOT NULL THEN
        SELECT "v_roleId" INTO legacy_role_id FROM public.tbl_role WHERE v_roleid = NEW.v_roleid LIMIT 1;
        NEW."v_roleId" := legacy_role_id;
      END IF;
      NEW.v_createdat := COALESCE(NEW.v_createdat, NEW."v_createdAt"::timestamptz, now());
      NEW."v_createdAt" := COALESCE(NEW."v_createdAt", NEW.v_createdat::timestamp);
      NEW.v_updatedat := COALESCE(NEW.v_updatedat, now());
      NEW."v_updatedAt" := COALESCE(NEW."v_updatedAt", NEW.v_updatedat::timestamp);
      RETURN NEW;
    END;
    $$;
    DROP TRIGGER IF EXISTS katala_sync_user_app_columns ON public.tbl_user;
    CREATE TRIGGER katala_sync_user_app_columns
      BEFORE INSERT OR UPDATE ON public.tbl_user
      FOR EACH ROW EXECUTE FUNCTION public.katala_sync_user_app_columns();
  `)
}

async function ensureProductTable(client) {
  await addColumn(client, 'tbl_product', 'v_productid', 'uuid', 'DEFAULT gen_random_uuid()')
  await addColumn(client, 'tbl_product', 'v_productcategoryid', 'uuid')
  await addColumn(client, 'tbl_product', 'v_productcategory', 'varchar(150)')
  await addColumn(client, 'tbl_product', 'v_productname', 'varchar(255)')
  await addColumn(client, 'tbl_product', 'v_productdescription', 'text')
  await addColumn(client, 'tbl_product', 'v_productimageurl', 'text')
  await addColumn(client, 'tbl_product', 'v_isactive', 'boolean', 'DEFAULT true')
  await addColumn(client, 'tbl_product', 'v_createdat', 'timestamptz', 'DEFAULT now()')
  await addColumn(client, 'tbl_product', 'v_updatedat', 'timestamptz', 'DEFAULT now()')
  await client.query(`
    UPDATE public.tbl_product
       SET v_productid = COALESCE(v_productid, gen_random_uuid()),
           v_productcategory = COALESCE(v_productcategory, "v_productCategory"),
           v_productname = COALESCE(v_productname, "v_productName"),
           v_productdescription = COALESCE(v_productdescription, "v_productDescription"),
           v_isactive = COALESCE(v_isactive, "v_isActive"),
           v_createdat = COALESCE(v_createdat, "v_createdAt"::timestamptz),
           v_updatedat = COALESCE(v_updatedat, "v_updatedAt"::timestamptz, now())
  `)
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_katala_app_product_id ON public.tbl_product(v_productid)')
  await client.query(`
    CREATE OR REPLACE FUNCTION public.katala_sync_product_app_columns()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.v_productid := COALESCE(NEW.v_productid, gen_random_uuid());
      NEW.v_productname := COALESCE(NEW.v_productname, NEW."v_productName");
      NEW."v_productName" := COALESCE(NEW."v_productName", NEW.v_productname);
      NEW.v_productcategory := COALESCE(NEW.v_productcategory, NEW."v_productCategory");
      NEW."v_productCategory" := COALESCE(NEW."v_productCategory", NEW.v_productcategory);
      NEW.v_productdescription := COALESCE(NEW.v_productdescription, NEW."v_productDescription");
      NEW."v_productDescription" := COALESCE(NEW."v_productDescription", NEW.v_productdescription);
      NEW.v_isactive := COALESCE(NEW.v_isactive, NEW."v_isActive", TRUE);
      NEW."v_isActive" := COALESCE(NEW."v_isActive", NEW.v_isactive, TRUE);
      NEW.v_createdat := COALESCE(NEW.v_createdat, NEW."v_createdAt"::timestamptz, now());
      NEW."v_createdAt" := COALESCE(NEW."v_createdAt", NEW.v_createdat::timestamp);
      NEW.v_updatedat := COALESCE(NEW.v_updatedat, now());
      NEW."v_updatedAt" := COALESCE(NEW."v_updatedAt", NEW.v_updatedat::timestamp);
      RETURN NEW;
    END;
    $$;
    DROP TRIGGER IF EXISTS katala_sync_product_app_columns ON public.tbl_product;
    CREATE TRIGGER katala_sync_product_app_columns
      BEFORE INSERT OR UPDATE ON public.tbl_product
      FOR EACH ROW EXECUTE FUNCTION public.katala_sync_product_app_columns();
  `)
}

async function ensureServiceTable(client) {
  await addColumn(client, 'tbl_service', 'v_serviceid', 'uuid', 'DEFAULT gen_random_uuid()')
  await addColumn(client, 'tbl_service', 'v_servicecategoryid', 'uuid')
  await addColumn(client, 'tbl_service', 'v_servicecategory', 'varchar(150)')
  await addColumn(client, 'tbl_service', 'v_servicecode', 'varchar(50)')
  await addColumn(client, 'tbl_service', 'v_servicename', 'varchar(255)')
  await addColumn(client, 'tbl_service', 'v_servicedescription', 'text')
  await addColumn(client, 'tbl_service', 'v_servicerequirements', 'text')
  await addColumn(client, 'tbl_service', 'v_estimatedduration', 'varchar(100)')
  await addColumn(client, 'tbl_service', 'v_serviceimageurl', 'text')
  await addColumn(client, 'tbl_service', 'v_minprice', 'numeric(12,2)')
  await addColumn(client, 'tbl_service', 'v_maxprice', 'numeric(12,2)')
  await addColumn(client, 'tbl_service', 'v_isinspectionrequired', 'boolean', 'DEFAULT false')
  await addColumn(client, 'tbl_service', 'v_isactive', 'boolean', 'DEFAULT true')
  await addColumn(client, 'tbl_service', 'v_createdat', 'timestamptz', 'DEFAULT now()')
  await addColumn(client, 'tbl_service', 'v_updatedat', 'timestamptz', 'DEFAULT now()')
  await client.query(`
    UPDATE public.tbl_service
       SET v_serviceid = COALESCE(v_serviceid, gen_random_uuid()),
           v_servicecategory = COALESCE(v_servicecategory, "v_serviceCategory"),
           v_servicecode = COALESCE(v_servicecode, "v_serviceCode"),
           v_servicename = COALESCE(v_servicename, "v_serviceName"),
           v_servicedescription = COALESCE(v_servicedescription, "v_serviceDescription"),
           v_minprice = COALESCE(v_minprice, "v_basePrice"),
           v_maxprice = COALESCE(v_maxprice, "v_basePrice"),
           v_isactive = COALESCE(v_isactive, "v_isActive"),
           v_createdat = COALESCE(v_createdat, "v_createdAt"::timestamptz),
           v_updatedat = COALESCE(v_updatedat, "v_updatedAt"::timestamptz, now())
  `)
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_katala_app_service_id ON public.tbl_service(v_serviceid)')
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_katala_app_service_code ON public.tbl_service(v_servicecode)')
  await client.query(`
    CREATE OR REPLACE FUNCTION public.katala_sync_service_app_columns()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.v_serviceid := COALESCE(NEW.v_serviceid, gen_random_uuid());
      NEW.v_servicename := COALESCE(NEW.v_servicename, NEW."v_serviceName");
      NEW."v_serviceName" := COALESCE(NEW."v_serviceName", NEW.v_servicename);
      NEW.v_servicecode := COALESCE(NEW.v_servicecode, NEW."v_serviceCode", 'SVC-' || left(NEW.v_serviceid::text, 8));
      NEW."v_serviceCode" := COALESCE(NEW."v_serviceCode", NEW.v_servicecode);
      NEW.v_servicecategory := COALESCE(NEW.v_servicecategory, NEW."v_serviceCategory");
      NEW."v_serviceCategory" := COALESCE(NEW."v_serviceCategory", NEW.v_servicecategory);
      NEW.v_servicedescription := COALESCE(NEW.v_servicedescription, NEW."v_serviceDescription");
      NEW."v_serviceDescription" := COALESCE(NEW."v_serviceDescription", NEW.v_servicedescription);
      NEW.v_minprice := COALESCE(NEW.v_minprice, NEW."v_basePrice");
      NEW.v_maxprice := COALESCE(NEW.v_maxprice, NEW."v_basePrice");
      NEW."v_basePrice" := COALESCE(NEW."v_basePrice", NEW.v_minprice, NEW.v_maxprice);
      NEW.v_isactive := COALESCE(NEW.v_isactive, NEW."v_isActive", TRUE);
      NEW."v_isActive" := COALESCE(NEW."v_isActive", NEW.v_isactive, TRUE);
      NEW.v_createdat := COALESCE(NEW.v_createdat, NEW."v_createdAt"::timestamptz, now());
      NEW."v_createdAt" := COALESCE(NEW."v_createdAt", NEW.v_createdat::timestamp);
      NEW.v_updatedat := COALESCE(NEW.v_updatedat, now());
      NEW."v_updatedAt" := COALESCE(NEW."v_updatedAt", NEW.v_updatedat::timestamp);
      RETURN NEW;
    END;
    $$;
    DROP TRIGGER IF EXISTS katala_sync_service_app_columns ON public.tbl_service;
    CREATE TRIGGER katala_sync_service_app_columns
      BEFORE INSERT OR UPDATE ON public.tbl_service
      FOR EACH ROW EXECUTE FUNCTION public.katala_sync_service_app_columns();
  `)
}

async function ensureProjectTable(client) {
  await relaxColumn(client, 'tbl_project', 'v_serviceRequestId')
  await addColumn(client, 'tbl_project', 'v_projectid', 'uuid', 'DEFAULT gen_random_uuid()')
  await addColumn(client, 'tbl_project', 'v_projecttitle', 'varchar(255)')
  await addColumn(client, 'tbl_project', 'v_clientname', 'varchar(255)')
  await addColumn(client, 'tbl_project', 'v_projectlocation', 'varchar(255)')
  await addColumn(client, 'tbl_project', 'v_projecttype', 'varchar(100)')
  await addColumn(client, 'tbl_project', 'v_projectoverview', 'text')
  await addColumn(client, 'tbl_project', 'v_servicesperformed', 'text')
  await addColumn(client, 'tbl_project', 'v_completiondate', 'date')
  await addColumn(client, 'tbl_project', 'v_coverimageurl', 'text')
  await addColumn(client, 'tbl_project', 'v_isfeatured', 'boolean', 'DEFAULT false')
  await addColumn(client, 'tbl_project', 'v_ispublished', 'boolean', 'DEFAULT false')
  await addColumn(client, 'tbl_project', 'v_createdat', 'timestamptz', 'DEFAULT now()')
  await addColumn(client, 'tbl_project', 'v_updatedat', 'timestamptz', 'DEFAULT now()')
  await client.query(`
    UPDATE public.tbl_project
       SET v_projectid = COALESCE(v_projectid, gen_random_uuid()),
           v_projecttitle = COALESCE(v_projecttitle, "v_projectName"),
           v_projectlocation = COALESCE(v_projectlocation, "v_projectLocation"),
           v_projecttype = COALESCE(v_projecttype, "v_projectStatus"),
           v_projectoverview = COALESCE(v_projectoverview, "v_projectDescription"),
           v_createdat = COALESCE(v_createdat, "v_createdAt"::timestamptz),
           v_updatedat = COALESCE(v_updatedat, "v_updatedAt"::timestamptz, now())
  `)
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_katala_app_project_id ON public.tbl_project(v_projectid)')
}

async function ensureQuotationTable(client) {
  await relaxColumn(client, 'tbl_quotation', 'v_serviceRequestId')
  await addColumn(client, 'tbl_quotation', 'v_quotationid', 'uuid', 'DEFAULT gen_random_uuid()')
  await addColumn(client, 'tbl_quotation', 'v_userid', 'uuid')
  await addColumn(client, 'tbl_quotation', 'v_referencenumber', 'varchar(50)')
  await addColumn(client, 'tbl_quotation', 'v_projectname', 'varchar(255)')
  await addColumn(client, 'tbl_quotation', 'v_establishmentname', 'varchar(255)')
  await addColumn(client, 'tbl_quotation', 'v_projectdescription', 'text')
  await addColumn(client, 'tbl_quotation', 'v_projectaddress', 'text')
  await addColumn(client, 'tbl_quotation', 'v_customerremarks', 'text')
  await addColumn(client, 'tbl_quotation', 'v_adminremarks', 'text')
  await addColumn(client, 'tbl_quotation', 'v_additionalcost', 'numeric(12,2)', 'DEFAULT 0')
  await addColumn(client, 'tbl_quotation', 'v_quotationstatus', 'varchar(50)', "DEFAULT 'Submitted'")
  await addColumn(client, 'tbl_quotation', 'v_validuntil', 'date')
  await addColumn(client, 'tbl_quotation', 'v_submittedat', 'timestamptz', 'DEFAULT now()')
  await addColumn(client, 'tbl_quotation', 'v_reviewedat', 'timestamptz')
  await addColumn(client, 'tbl_quotation', 'v_createdat', 'timestamptz', 'DEFAULT now()')
  await addColumn(client, 'tbl_quotation', 'v_updatedat', 'timestamptz', 'DEFAULT now()')
  await addColumn(client, 'tbl_quotation', 'v_quotationdate', 'date')
  await addColumn(client, 'tbl_quotation', 'v_scheduleddate', 'date')
  await addColumn(client, 'tbl_quotation', 'v_scheduledtime', 'time')
  await addColumn(client, 'tbl_quotation', 'v_assignedstaff', 'text')
  await addColumn(client, 'tbl_quotation', 'v_completedat', 'timestamptz')
  await client.query(`
    UPDATE public.tbl_quotation
       SET v_quotationid = COALESCE(v_quotationid, gen_random_uuid()),
           v_referencenumber = COALESCE(v_referencenumber, "v_quotationNumber"),
           v_projectname = COALESCE(v_projectname, "v_quotationNumber"),
           v_customerremarks = COALESCE(v_customerremarks, "v_customerRemarks"),
           v_quotationstatus = COALESCE(v_quotationstatus, "v_quotationStatus", 'Submitted'),
           v_validuntil = COALESCE(v_validuntil, "v_validUntil"::date),
           v_submittedat = COALESCE(v_submittedat, "v_quotationDate"::timestamptz, now()),
           v_createdat = COALESCE(v_createdat, "v_createdAt"::timestamptz),
           v_updatedat = COALESCE(v_updatedat, "v_updatedAt"::timestamptz, now()),
           v_quotationdate = COALESCE(v_quotationdate, "v_quotationDate"::date)
  `)
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_katala_app_quotation_id ON public.tbl_quotation(v_quotationid)')
  await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_katala_app_quotation_ref ON public.tbl_quotation(v_referencenumber)')
  await client.query(`
    CREATE OR REPLACE FUNCTION public.katala_sync_quotation_app_columns()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.v_quotationid := COALESCE(NEW.v_quotationid, gen_random_uuid());
      NEW.v_referencenumber := COALESCE(NEW.v_referencenumber, NEW."v_quotationNumber", 'QT-' || left(NEW.v_quotationid::text, 8));
      NEW."v_quotationNumber" := COALESCE(NEW."v_quotationNumber", NEW.v_referencenumber);
      NEW.v_quotationstatus := COALESCE(NEW.v_quotationstatus, NEW."v_quotationStatus", 'Submitted');
      NEW."v_quotationStatus" := COALESCE(NEW."v_quotationStatus", NEW.v_quotationstatus);
      NEW.v_customerremarks := COALESCE(NEW.v_customerremarks, NEW."v_customerRemarks");
      NEW."v_customerRemarks" := COALESCE(NEW."v_customerRemarks", NEW.v_customerremarks);
      NEW.v_submittedat := COALESCE(NEW.v_submittedat, NEW."v_quotationDate"::timestamptz, now());
      NEW."v_quotationDate" := COALESCE(NEW."v_quotationDate", NEW.v_submittedat::timestamp);
      NEW.v_createdat := COALESCE(NEW.v_createdat, NEW."v_createdAt"::timestamptz, now());
      NEW."v_createdAt" := COALESCE(NEW."v_createdAt", NEW.v_createdat::timestamp);
      NEW.v_updatedat := COALESCE(NEW.v_updatedat, now());
      NEW."v_updatedAt" := COALESCE(NEW."v_updatedAt", NEW.v_updatedat::timestamp);
      RETURN NEW;
    END;
    $$;
    DROP TRIGGER IF EXISTS katala_sync_quotation_app_columns ON public.tbl_quotation;
    CREATE TRIGGER katala_sync_quotation_app_columns
      BEFORE INSERT OR UPDATE ON public.tbl_quotation
      FOR EACH ROW EXECUTE FUNCTION public.katala_sync_quotation_app_columns();
  `)
}

async function ensureMissingAppTables(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.local_auth_accounts (
      v_userid uuid PRIMARY KEY,
      v_emailaddress varchar(255) NOT NULL UNIQUE,
      v_passwordhash varchar(255) NOT NULL,
      v_createdat timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO public.local_auth_accounts (v_userid, v_emailaddress, v_passwordhash)
    SELECT v_userid, v_emailaddress, v_passwordhash
      FROM public.tbl_user
     WHERE v_userid IS NOT NULL
       AND v_emailaddress IS NOT NULL
       AND v_passwordhash IS NOT NULL
    ON CONFLICT (v_userid) DO UPDATE SET
      v_emailaddress = EXCLUDED.v_emailaddress,
      v_passwordhash = EXCLUDED.v_passwordhash;

    CREATE TABLE IF NOT EXISTS public.tbl_userrole (
      v_userroleid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      v_userid uuid NOT NULL,
      v_roleid uuid NOT NULL,
      v_assignedat timestamptz NOT NULL DEFAULT now(),
      UNIQUE (v_userid, v_roleid)
    );
    INSERT INTO public.tbl_userrole (v_userid, v_roleid)
    SELECT v_userid, v_roleid
      FROM public.tbl_user
     WHERE v_userid IS NOT NULL
       AND v_roleid IS NOT NULL
    ON CONFLICT (v_userid, v_roleid) DO NOTHING;

    CREATE TABLE IF NOT EXISTS public.tbl_useraddress (
      v_useraddressid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      v_userid uuid NOT NULL,
      v_addresslabel varchar(50),
      v_establishmentname varchar(255),
      v_housebuildingnumber varchar(100),
      v_streetname varchar(255),
      v_barangay varchar(150),
      v_citymunicipality varchar(150) NOT NULL,
      v_province varchar(150) NOT NULL,
      v_postalcode varchar(10),
      v_landmark text,
      v_isdefault boolean NOT NULL DEFAULT false,
      v_createdat timestamptz NOT NULL DEFAULT now(),
      v_updatedat timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.tbl_productcategory (
      v_productcategoryid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      v_categoryname varchar(150) NOT NULL UNIQUE,
      v_categorydescription text,
      v_categoryimageurl text,
      v_isactive boolean NOT NULL DEFAULT true,
      v_createdat timestamptz NOT NULL DEFAULT now(),
      v_updatedat timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.tbl_productvariant (
      v_productvariantid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      v_productid uuid NOT NULL,
      v_productcode varchar(80) NOT NULL UNIQUE,
      v_productmodel varchar(100),
      v_productsize varchar(100),
      v_productunit varchar(50),
      v_variantdescription text,
      v_variantimageurl text,
      v_minprice numeric(12,2),
      v_maxprice numeric(12,2),
      v_availabilitystatus varchar(30) NOT NULL DEFAULT 'Available',
      v_isactive boolean NOT NULL DEFAULT true,
      v_stockquantity int DEFAULT 0,
      v_reorderlevel int DEFAULT 0,
      v_createdat timestamptz NOT NULL DEFAULT now(),
      v_updatedat timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.tbl_servicecategory (
      v_servicecategoryid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      v_categoryname varchar(150) NOT NULL UNIQUE,
      v_categorydescription text,
      v_categoryimageurl text,
      v_isactive boolean NOT NULL DEFAULT true,
      v_createdat timestamptz NOT NULL DEFAULT now(),
      v_updatedat timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.tbl_quotationproductitem (
      v_quotationproductitemid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      v_quotationid uuid NOT NULL,
      v_productvariantid uuid NOT NULL,
      v_quantity int NOT NULL,
      v_unitprice numeric(12,2),
      v_itemdescription text,
      v_adminremarks text,
      v_createdat timestamptz NOT NULL DEFAULT now(),
      v_updatedat timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.tbl_quotationserviceitem (
      v_quotationserviceitemid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      v_quotationid uuid NOT NULL,
      v_serviceid uuid NOT NULL,
      v_quantity int NOT NULL DEFAULT 1,
      v_unitprice numeric(12,2),
      v_itemdescription text,
      v_adminremarks text,
      v_createdat timestamptz NOT NULL DEFAULT now(),
      v_updatedat timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.tbl_quotationstatushistory (
      v_quotationstatushistoryid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      v_quotationid uuid NOT NULL,
      v_updatedbyuserid uuid NOT NULL,
      v_status varchar(50) NOT NULL,
      v_statusremarks text,
      v_createdat timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.tbl_paymenttransaction (
      v_paymenttransactionid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      v_quotationid uuid,
      v_servicerequestid uuid,
      v_userid uuid NOT NULL,
      v_referencenumber varchar(80) NOT NULL UNIQUE,
      v_paymongo_checkoutsessionid varchar(120) UNIQUE,
      v_paymongo_paymentintentid varchar(120),
      v_paymongo_paymentid varchar(120) UNIQUE,
      v_status varchar(30) NOT NULL DEFAULT 'Pending',
      v_amount numeric(12,2) NOT NULL,
      v_currency varchar(3) NOT NULL DEFAULT 'PHP',
      v_paymentmethod varchar(40),
      v_checkouturl text,
      v_receiptnumber varchar(80) UNIQUE,
      v_billingname varchar(180),
      v_billingemail varchar(180),
      v_billingphone varchar(80),
      v_rawpayload jsonb,
      v_paidat timestamptz,
      v_createdat timestamptz NOT NULL DEFAULT now(),
      v_updatedat timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.tbl_servicerequest (
      v_servicerequestid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      v_userid uuid NOT NULL,
      v_serviceid uuid NOT NULL,
      v_useraddressid uuid,
      v_referencenumber varchar(50) NOT NULL UNIQUE,
      v_projectname varchar(255),
      v_establishmentname varchar(255),
      v_contactperson varchar(255),
      v_contactnumber varchar(40),
      v_problemdescription text NOT NULL,
      v_projectaddress text,
      v_preferreddate date,
      v_preferredtime time,
      v_prioritylevel varchar(20) NOT NULL DEFAULT 'Normal',
      v_requeststatus varchar(50) NOT NULL DEFAULT 'Submitted',
      v_customerremarks text,
      v_adminremarks text,
      v_quotedamount numeric(12,2),
      v_paymentstatus varchar(30),
      v_receiptnumber varchar(80),
      v_paidat timestamptz,
      v_pricehistory jsonb,
      v_submittedat timestamptz NOT NULL DEFAULT now(),
      v_completedat timestamptz,
      v_createdat timestamptz NOT NULL DEFAULT now(),
      v_updatedat timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.tbl_servicerequeststatushistory (
      v_servicerequeststatushistoryid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      v_servicerequestid uuid NOT NULL,
      v_updatedbyuserid uuid NOT NULL,
      v_status varchar(50) NOT NULL,
      v_statusremarks text,
      v_createdat timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.tbl_appointment (
      v_appointmentid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      v_servicerequestid uuid NOT NULL,
      v_appointmenttype varchar(50) NOT NULL,
      v_scheduleddate date NOT NULL,
      v_starttime time NOT NULL,
      v_endtime time,
      v_appointmentstatus varchar(30) NOT NULL DEFAULT 'Pending',
      v_locationdetails text,
      v_adminremarks text,
      v_createdat timestamptz NOT NULL DEFAULT now(),
      v_updatedat timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.tbl_serviceassignment (
      v_serviceassignmentid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      v_servicerequestid uuid NOT NULL,
      v_technicianuserid uuid NOT NULL,
      v_assignmentrole varchar(100),
      v_assignmentstatus varchar(30) NOT NULL DEFAULT 'Assigned',
      v_assignmentremarks text,
      v_assignedat timestamptz NOT NULL DEFAULT now(),
      v_completedat timestamptz,
      UNIQUE (v_servicerequestid, v_technicianuserid)
    );

    CREATE TABLE IF NOT EXISTS public.tbl_attachment (
      v_attachmentid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      v_uploadedbyuserid uuid NOT NULL,
      v_quotationid uuid,
      v_servicerequestid uuid,
      v_filename varchar(255) NOT NULL,
      v_fileurl text NOT NULL,
      v_filetype varchar(100),
      v_filesize bigint,
      v_attachmentdescription text,
      v_uploadedat timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.tbl_notification (
      v_notificationid uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      v_userid uuid NOT NULL,
      v_notificationtype varchar(50) NOT NULL,
      v_quotationid uuid,
      v_servicerequestid uuid,
      v_appointmentid uuid,
      v_notificationtitle varchar(255) NOT NULL,
      v_notificationmessage text NOT NULL,
      v_isread boolean NOT NULL DEFAULT false,
      v_readat timestamptz,
      v_createdat timestamptz NOT NULL DEFAULT now()
    );
  `)
}

async function seedCatalog(client) {
  await client.query(`
    INSERT INTO public.tbl_productcategory (v_categoryname)
    SELECT DISTINCT COALESCE(v_productcategory, 'Products')
      FROM public.tbl_product
     WHERE COALESCE(v_productcategory, '') <> ''
    ON CONFLICT (v_categoryname) DO NOTHING;

    UPDATE public.tbl_product p
       SET v_productcategoryid = pc.v_productcategoryid
      FROM public.tbl_productcategory pc
     WHERE p.v_productcategoryid IS NULL
       AND pc.v_categoryname = p.v_productcategory;

    INSERT INTO public.tbl_productvariant
      (v_productid, v_productcode, v_productmodel, v_productunit, v_variantdescription, v_minprice, v_maxprice, v_isactive, v_stockquantity, v_reorderlevel)
    SELECT
      p.v_productid,
      COALESCE(NULLIF(p."v_productCode", ''), 'PROD-' || p."v_productId"::text),
      NULLIF(p."v_model", ''),
      NULLIF(p."v_unitOfMeasure", ''),
      p.v_productdescription,
      p."v_currentPrice",
      p."v_currentPrice",
      COALESCE(p.v_isactive, TRUE),
      COALESCE(i."v_quantityAvailable"::int, i."v_quantityOnHand"::int, 0),
      COALESCE(i."v_reorderLevel"::int, 0)
    FROM public.tbl_product p
    LEFT JOIN public.tbl_inventory i ON i."v_productId" = p."v_productId"
    WHERE p.v_productid IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.tbl_productvariant pv WHERE pv.v_productid = p.v_productid
      )
    ON CONFLICT (v_productcode) DO NOTHING;

    INSERT INTO public.tbl_servicecategory (v_categoryname)
    SELECT DISTINCT COALESCE(v_servicecategory, 'Services')
      FROM public.tbl_service
     WHERE COALESCE(v_servicecategory, '') <> ''
    ON CONFLICT (v_categoryname) DO NOTHING;

    UPDATE public.tbl_service s
       SET v_servicecategoryid = sc.v_servicecategoryid
      FROM public.tbl_servicecategory sc
     WHERE s.v_servicecategoryid IS NULL
       AND sc.v_categoryname = s.v_servicecategory;
  `)
}

await main()
