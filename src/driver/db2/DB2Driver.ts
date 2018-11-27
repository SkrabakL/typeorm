import { Driver } from "../Driver";
import { ConnectionIsNotSetError } from "../../error/ConnectionIsNotSetError";
import { DriverPackageNotInstalledError } from "../../error/DriverPackageNotInstalledError";
import { DB2QueryRunner } from "./DB2QueryRunner";
import { ObjectLiteral } from "../../common/ObjectLiteral";
import { ColumnMetadata } from "../../metadata/ColumnMetadata";
import { DateUtils } from "../../util/DateUtils";
import { PlatformTools } from "../../platform/PlatformTools";
import { Connection } from "../../connection/Connection";
import { RdbmsSchemaBuilder } from "../../schema-builder/RdbmsSchemaBuilder";
import { DB2ConnectionOptions } from "./DB2ConnectionOptions";
import { MappedColumnTypes } from "../types/MappedColumnTypes";
import { ColumnType } from "../types/ColumnTypes";
import { DataTypeDefaults } from "../types/DataTypeDefaults";
import { TableColumn } from "../../schema-builder/table/TableColumn";
import { DB2ConnectionCredentialsOptions } from "./DB2ConnectionCredentialsOptions";
import { DriverUtils } from "../DriverUtils";
import { EntityMetadata } from "../../metadata/EntityMetadata";
import { OrmUtils } from "../../util/OrmUtils";

/*
    "smallint",
    "integer",
    "bigint",
    "real",
    "double",
    "float",
    "decimal",
    "numeric",
    "decfloat",
    "time",
    "timestamp",
    "date",
    // "String",
    "character",
    "char",
    "varchar",
    "clob",
    "graphic",
    "vargraphic",
    "dbclob",
    "blob",
    "boolean",
    "xml"
  */

/**
 * Organizes communication with DB2 RDBMS.
 */
export class DB2Driver implements Driver {
  // -------------------------------------------------------------------------
  // Public Properties
  // -------------------------------------------------------------------------

  /**
   * Connection used by driver.
   */
  connection: Connection;

  /**
   * Underlying db2 library.
   */
  db2: any;

  /**
   * Pool for master database.
   */
  master: any;

  /**
   * Pool for slave databases.
   * Used in replication.
   */
  slaves: any[] = [];

  // -------------------------------------------------------------------------
  // Public Implemented Properties
  // -------------------------------------------------------------------------

  /**
   * Connection options.
   */
  options: DB2ConnectionOptions;

  /**
   * Master database used to perform all write queries.
   */
  database?: string;

  /**
   * Indicates if replication is enabled.
   */
  isReplicated: boolean = false;

  /**
   * Indicates if tree tables are supported by this driver.
   */
  treeSupport = true;

  /**
   * Gets list of supported column data types by a driver.
   *
   * @see https://www.techonthenet.com/db2/datatypes.php
   */
  supportedDataTypes: ColumnType[] = [
    "smallint",
    "integer",
    "bigint",
    "real",
    "double",
    "float",
    "decimal",
    "numeric",
    "decfloat",
    "time",
    "timestamp",
    "date",
    // "String",
    "character",
    "char",
    "varchar",
    "clob",
    "graphic",
    "vargraphic",
    "dbclob",
    "blob",
    "boolean",
    "xml",

    "datetime",

    "char",
    "nchar",
    "long",
    "raw",
    "long raw",
    "numeric",
    "float",
    "dec",
    "decimal",
    "int",
    "real",
    "double precision",
    "date",
    "timestamp",
    "timestamp with time zone",
    "timestamp with local time zone",
    "interval year to month",
    "interval day to second",
    "bfile",
    "blob",
    "clob",
    "nclob",
    "rowid",
    "urowid"
  ];

  /**
   * Gets list of spatial column data types.
   */
  spatialTypes: ColumnType[] = [];

  /**
   * Gets list of column data types that support length by a driver.
   */
  withLengthColumnTypes: ColumnType[] = ["char", "nchar", "varchar", "raw"];

  /**
   * Gets list of column data types that support precision by a driver.
   */
  withPrecisionColumnTypes: ColumnType[] = [
    "float",
    "timestamp",
    "timestamp with time zone",
    "timestamp with local time zone"
  ];

  /**
   * Gets list of column data types that support scale by a driver.
   */
  withScaleColumnTypes: ColumnType[] = [];

  /**
   * Orm has special columns and we need to know what database column types should be for those types.
   * Column types are driver dependant.
   */
  mappedDataTypes: MappedColumnTypes = {
    createDate: "timestamp",
    createDateDefault: "CURRENT_TIMESTAMP",
    updateDate: "timestamp",
    updateDateDefault: "CURRENT_TIMESTAMP",
    version: "bigint",
    treeLevel: "bigint",
    migrationId: "bigint",
    migrationName: "varchar",
    migrationTimestamp: "bigint",
    cacheId: "bigint",
    cacheIdentifier: "varchar",
    cacheTime: "bigint",
    cacheDuration: "bigint",
    cacheQuery: "clob",
    cacheResult: "clob"
  };

  /**
   * Default values of length, precision and scale depends on column data type.
   * Used in the cases when length/precision/scale is not specified by user.
   */
  dataTypeDefaults: DataTypeDefaults = {
    char: { length: 1 },
    nchar: { length: 1 },
    varchar: { length: 255 },
    // varchar2: { length: 255 },
    // nvarchar2: { length: 255 },
    raw: { length: 2000 },
    float: { precision: 126 },
    timestamp: { precision: 6 },
    "timestamp with time zone": { precision: 6 },
    "timestamp with local time zone": { precision: 6 }
  };

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  constructor(connection: Connection) {
    this.connection = connection;
    this.options = connection.options as DB2ConnectionOptions;

    // load db2 package
    this.loadDependencies();

    // extra db2 setup
    // this.db2.outFormat = this.db2.OBJECT;

    // Object.assign(connection.options, DriverUtils.buildDriverOptions(connection.options)); // todo: do it better way
    // validate options to make sure everything is set
    // if (!this.options.host)
    //     throw new DriverOptionNotSetError("host");
    // if (!this.options.username)
    //     throw new DriverOptionNotSetError("username");
    // if (!this.options.sid)
    //     throw new DriverOptionNotSetError("sid");
    //
  }

  // -------------------------------------------------------------------------
  // Public Methods
  // -------------------------------------------------------------------------

  /**
   * Performs connection to the database.
   * Based on pooling options, it can either create connection immediately,
   * either create a pool and create connection when needed.
   */
  async connect(): Promise<void> {
    // this.db2.fetchAsString = [this.db2.CLOB];
    // this.db2.fetchAsBuffer = [this.db2.BLOB];
    // if (false === true && this.options.replication) {
    //   this.slaves = await Promise.all(
    //     this.options.replication!.slaves!.map(slave => {
    //       return this.createPool(this.options, slave);
    //     })
    //   );
    //   this.master = await this.createPool(
    //     this.options,
    //     this.options.replication!.master
    //   );
    //   this.database = this.options.replication!.master!.database;
    // } else {
    this.master = await this.createPool(this.options, this.options);
    this.database = this.options.database;
    // }
  }

  /**
   * Makes any action after connection (e.g. create extensions in Postgres driver).
   */
  afterConnect(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Closes connection with the database.
   */
  async disconnect(): Promise<void> {
    if (!this.master) return Promise.reject(new ConnectionIsNotSetError("db2"));

    await this.closePool(this.master);
    await Promise.all(this.slaves.map(slave => this.closePool(slave)));
    this.master = undefined;
    this.slaves = [];
  }

  /**
   * Creates a schema builder used to build and sync a schema.
   */
  createSchemaBuilder() {
    return new RdbmsSchemaBuilder(this.connection);
  }

  /**
   * Creates a query runner used to execute database queries.
   */
  createQueryRunner(mode: "master" | "slave" = "master") {
    return new DB2QueryRunner(this, mode);
  }

  /**
   * Replaces parameters in the given sql with special escaping character
   * and an array of parameter names to be passed to a query.
   */
  escapeQueryWithParameters(
    sql: string,
    parameters: ObjectLiteral,
    nativeParameters: ObjectLiteral
  ): [string, any[]] {
    const escapedParameters: any[] = Object.keys(nativeParameters).map(key => {
      if (typeof nativeParameters[key] === "boolean")
        return nativeParameters[key] ? 1 : 0;
      return nativeParameters[key];
    });
    if (!parameters || !Object.keys(parameters).length)
      return [sql, escapedParameters];

    const keys = Object.keys(parameters)
      .map(parameter => "(:(\\.\\.\\.)?" + parameter + "\\b)")
      .join("|");
    sql = sql.replace(new RegExp(keys, "g"), (key: string) => {
      let value: any;
      let isArray = false;
      if (key.substr(0, 4) === ":...") {
        isArray = true;
        value = parameters[key.substr(4)];
      } else {
        value = parameters[key.substr(1)];
      }

      if (isArray) {
        return value
          .map((v: any, index: number) => {
            escapedParameters.push(v);
            return `:${key.substr(4)}${index}`;
          })
          .join(", ");
      } else if (value instanceof Function) {
        return value();
      } else if (typeof value === "boolean") {
        return value ? 1 : 0;
      } else {
        escapedParameters.push(value);
        return key;
      }
    }); // todo: make replace only in value statements, otherwise problems
    return [sql, escapedParameters];
  }

  /**
   * Escapes a column name.
   */
  escape(columnName: string): string {
    return `${columnName.toUpperCase()}`;
  }

  /**
   * Build full table name with database name, schema name and table name.
   * DB2 does not support table schemas. One user can have only one schema.
   */
  buildTableName(
    tableName: string,
    schema?: string,
    database?: string
  ): string {
    return tableName;
  }

  /**
   * Prepares given value to a value to be persisted, based on its column type and metadata.
   */
  preparePersistentValue(value: any, columnMetadata: ColumnMetadata): any {
    if (columnMetadata.transformer)
      value = columnMetadata.transformer.to(value);

    if (value === null || value === undefined) return value;

    if (columnMetadata.type === Boolean) {
      return value ? 1 : 0;
    } else if (columnMetadata.type === "date") {
      if (typeof value === "string") value = value.replace(/[^0-9-]/g, "");
      return () =>
        `TO_DATE('${DateUtils.mixedDateToDateString(value)}', 'YYYY-MM-DD')`;
    } else if (
      columnMetadata.type === Date ||
      columnMetadata.type === "datetime" ||
      columnMetadata.type === "timestamp" ||
      columnMetadata.type === "timestamp with time zone" ||
      columnMetadata.type === "timestamp with local time zone"
    ) {
      return DateUtils.mixedDateToDate(value);
    } else if (columnMetadata.type === "simple-array") {
      return DateUtils.simpleArrayToString(value);
    } else if (columnMetadata.type === "simple-json") {
      return DateUtils.simpleJsonToString(value);
    }

    return value;
  }

  /**
   * Prepares given value to a value to be persisted, based on its column type or metadata.
   */
  prepareHydratedValue(value: any, columnMetadata: ColumnMetadata): any {
    if (value === null || value === undefined) return value;

    if (columnMetadata.type === Boolean) {
      value = value === 1 ? true : false;
    } else if (columnMetadata.type === "date") {
      value = DateUtils.mixedDateToDateString(value);
    } else if (columnMetadata.type === "time") {
      value = DateUtils.mixedTimeToString(value);
    } else if (
      columnMetadata.type === Date ||
      columnMetadata.type === "timestamp" ||
      columnMetadata.type === "timestamp with time zone" ||
      columnMetadata.type === "timestamp with local time zone"
    ) {
      value = DateUtils.normalizeHydratedDate(value);
    } else if (columnMetadata.type === "json") {
      value = JSON.parse(value);
    } else if (columnMetadata.type === "simple-array") {
      value = DateUtils.stringToSimpleArray(value);
    } else if (columnMetadata.type === "simple-json") {
      value = DateUtils.stringToSimpleJson(value);
    }

    if (columnMetadata.transformer)
      value = columnMetadata.transformer.from(value);

    return value;
  }

  /**
   * Creates a database type from a given column metadata.
   */
  normalizeType(column: {
    type?: ColumnType;
    length?: number | string;
    precision?: number | null;
    scale?: number;
    isArray?: boolean;
  }): string {
    if (
      column.type === Number ||
      column.type === "number" ||
      column.type === "numeric" ||
      column.type === "dec" ||
      column.type === "decimal" ||
      column.type === "int" ||
      column.type === "integer"
    ) {
      return "integer";
    } else if (
      column.type === String ||
      column.type === "string" ||
      column.type === "text" ||
      column.type === "varchar"
    ) {
      return "varchar";
    } else if (
      column.type === "boolean" ||
      column.type === Boolean ||
      column.type === "tinyint"
    ) {
      return "smallint";
    } else if (column.type === "real" || column.type === "double precision") {
      return "float";
    } else if (column.type === Date || column.type === "datetime") {
      return "timestamp";
    } else if ((column.type as any) === Buffer) {
      return "blob";
    } else if (column.type === "uuid") {
      return "varchar";
    } else if (column.type === "simple-array") {
      return "clob";
    } else if (column.type === "simple-json") {
      return "clob";
    } else {
      return (column.type as string) || "";
    }
  }

  /**
   * Normalizes "default" value of the column.
   */
  normalizeDefault(columnMetadata: ColumnMetadata): string {
    const defaultValue = columnMetadata.default;

    if (typeof defaultValue === "number") {
      return "" + defaultValue;
    } else if (typeof defaultValue === "boolean") {
      return defaultValue === true ? "1" : "0";
    } else if (typeof defaultValue === "function") {
      return defaultValue();
    } else if (typeof defaultValue === "string") {
      return `'${defaultValue}'`;
    } else {
      return defaultValue;
    }
  }

  /**
   * Normalizes "isUnique" value of the column.
   */
  normalizeIsUnique(column: ColumnMetadata): boolean {
    return column.entityMetadata.uniques.some(
      uq => uq.columns.length === 1 && uq.columns[0] === column
    );
  }

  /**
   * Calculates column length taking into account the default length values.
   */
  getColumnLength(column: ColumnMetadata | TableColumn): string {
    if (column.length) return column.length.toString();

    switch (column.type) {
      case String:
      case "varchar":
        // case "varchar2":
        // case "nvarchar2":
        return "255";
      case "raw":
        return "2000";
      case "uuid":
        return "36";
      default:
        return "";
    }
  }

  createFullType(column: TableColumn): string {
    let type = column.type;

    // used 'getColumnLength()' method, because in DB2 column length is required for some data types.
    if (this.getColumnLength(column)) {
      type += `(${this.getColumnLength(column)})`;
    } else if (
      column.precision !== null &&
      column.precision !== undefined &&
      column.scale !== null &&
      column.scale !== undefined
    ) {
      type += "(" + column.precision + "," + column.scale + ")";
    } else if (column.precision !== null && column.precision !== undefined) {
      type += "(" + column.precision + ")";
    }

    if (column.type === "timestamp with time zone") {
      type =
        "TIMESTAMP" +
        (column.precision !== null && column.precision !== undefined
          ? "(" + column.precision + ")"
          : "") +
        " WITH TIME ZONE";
    } else if (column.type === "timestamp with local time zone") {
      type =
        "TIMESTAMP" +
        (column.precision !== null && column.precision !== undefined
          ? "(" + column.precision + ")"
          : "") +
        " WITH LOCAL TIME ZONE";
    }

    if (column.isArray) type += " array";

    return type;
  }

  /**
   * Obtains a new database connection to a master server.
   * Used for replication.
   * If replication is not setup then returns default connection's database connection.
   */
  obtainMasterConnection(): Promise<any> {
    return new Promise<any>((ok, fail) => {
      ok(this.master);
    });
  }

  /**
   * Obtains a new database connection to a slave server.
   * Used for replication.
   * If replication is not setup then returns master (default) connection's database connection.
   */
  obtainSlaveConnection(): Promise<any> {
    if (!this.slaves.length) return this.obtainMasterConnection();

    return new Promise<any>((ok, fail) => {
      const random = Math.floor(Math.random() * this.slaves.length);

      ok(this.slaves[random]);
      // this.slaves[random].getConnection((err: any, connection: any) => {
      //   if (err) return fail(err);
      //   ok(connection);
      // });
    });
  }

  /**
   * Creates generated map of values generated or returned by database after INSERT query.
   */
  createGeneratedMap(metadata: EntityMetadata, insertResult: ObjectLiteral) {
    if (!insertResult) return undefined;

    return Object.keys(insertResult).reduce(
      (map, key) => {
        const column = metadata.findColumnWithDatabaseName(key);
        if (column) {
          OrmUtils.mergeDeep(map, column.createValueMap(insertResult[key]));
        }
        return map;
      },
      {} as ObjectLiteral
    );
  }

  /**
   * Differentiate columns of this table and columns from the given column metadatas columns
   * and returns only changed.
   */
  findChangedColumns(
    tableColumns: TableColumn[],
    columnMetadatas: ColumnMetadata[]
  ): ColumnMetadata[] {
    return columnMetadatas.filter(columnMetadata => {
      const tableColumn = tableColumns.find(
        c => c.name === columnMetadata.databaseName
      );
      if (!tableColumn) return false; // we don't need new columns, we only need exist and changed

      return (
        tableColumn.name !== columnMetadata.databaseName ||
        tableColumn.type !== this.normalizeType(columnMetadata) ||
        tableColumn.length !== columnMetadata.length ||
        tableColumn.precision !== columnMetadata.precision ||
        tableColumn.scale !== columnMetadata.scale ||
        // || tableColumn.comment !== columnMetadata.comment || // todo
        this.normalizeDefault(columnMetadata) !== tableColumn.default ||
        tableColumn.isPrimary !== columnMetadata.isPrimary ||
        tableColumn.isNullable !== columnMetadata.isNullable ||
        tableColumn.isUnique !== this.normalizeIsUnique(columnMetadata) ||
        (columnMetadata.generationStrategy !== "uuid" &&
          tableColumn.isGenerated !== columnMetadata.isGenerated)
      );
    });
  }

  /**
   * Returns true if driver supports RETURNING / OUTPUT statement.
   */
  isReturningSqlSupported(): boolean {
    return true;
  }

  /**
   * Returns true if driver supports uuid values generation on its own.
   */
  isUUIDGenerationSupported(): boolean {
    return false;
  }

  /**
   * Creates an escaped parameter.
   */
  createParameter(parameterName: string, index: number): string {
    return "?";
  }

  /**
   * Converts column type in to native db2 type.
   */
  columnTypeToNativeParameter(type: ColumnType): any {
    switch (
      this.normalizeType({ type: type as any })
      // case "number":
      // case "numeric":
      // case "int":
      // case "integer":
      // case "smallint":
      // case "dec":
      // case "decimal":
      //   return this.db2.NUMBER;
      // case "char":
      // case "nchar":
      // case "nvarchar2":
      // case "varchar2":
      //   return this.db2.STRING;
      // case "blob":
      //   return this.db2.BLOB;
      // case "clob":
      //   return this.db2.CLOB;
      // case "date":
      // case "timestamp":
      // case "timestamp with time zone":
      // case "timestamp with local time zone":
      //   return this.db2.DATE;
    ) {
    }
  }

  // -------------------------------------------------------------------------
  // Protected Methods
  // -------------------------------------------------------------------------

  /**
   * Loads all driver dependencies.
   */
  protected loadDependencies(): void {
    try {
      this.db2 = PlatformTools.load("ibm_db");
    } catch (e) {
      throw new DriverPackageNotInstalledError("DB2", "ibm_db");
    }
  }

  /**
   * Creates a new connection pool for a given database credentials.
   */
  protected async createPool(
    options: DB2ConnectionOptions,
    credentials: DB2ConnectionCredentialsOptions
  ): Promise<any> {
    credentials = Object.assign(
      credentials,
      DriverUtils.buildDriverOptions(credentials)
    ); // todo: do it better way

    // build connection options for the driver
    const connectionOptions = Object.assign(
      {},
      {
        user: credentials.username,
        password: credentials.password,
        connectString: credentials.connectString
          ? credentials.connectString
          : `DATABASE=${credentials.database};HOSTNAME=${
              credentials.host
            };PORT=${credentials.port};PROTOCOL=TCPIP;UID=${
              credentials.username
            };PWD=${credentials.password}`
      },
      options.extra || {}
    );

    // pooling is enabled either when its set explicitly to true,
    // either when its not defined at all (e.g. enabled by default)
    return new Promise<void>((ok, fail) => {
      new this.db2.Pool().open(
        connectionOptions.connectString,
        (err: any, pool: any) => {
          if (err) return fail(err);
          ok(pool);
        }
      );
    });
  }

  /**
   * Closes connection pool.
   */
  protected async closePool(pool: any): Promise<void> {
    return new Promise<void>((ok, fail) => {
      pool.close((err: any) => (err ? fail(err) : ok()));
      pool = undefined;
    });
  }
}
